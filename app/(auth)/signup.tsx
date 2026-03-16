import * as AuthSession from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Href, router } from 'expo-router';
import { FormikHelpers, useFormikContext } from 'formik';
import React, { useRef, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TouchableOpacity,
    View,
} from 'react-native';

import AppErrorMessage from '@/components/form/AppErrorMessage';
import AppForm from '@/components/form/AppForm';
import AppFormField from '@/components/form/AppFormField';
import FormLoader from '@/components/form/FormLoader';
import SubmitButton from '@/components/form/SubmitButton';
import ToggleField from '@/components/form/ToggleField';
import AppText from '@/components/ui/AppText';
import Screen from '@/components/ui/Screen';
import StatusModal from '@/components/ui/StatusModal';
import { useColors } from '@/config/colors';
import {
    GOOGLE_ANDROID_CLIENT_ID,
    GOOGLE_IOS_CLIENT_ID,
    GOOGLE_WEB_CLIENT_ID,
} from '@/config/settings';
import { useAuth } from '@/context/AuthContext';
import { SignupFormValues, SignupValidationSchema } from '@/data/authValidation';
import { SignupRequest } from '@/types/auth.types';

WebBrowser.maybeCompleteAuthSession();

const extractFirstErrorText = (value: unknown): string | null => {
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = extractFirstErrorText(item);
            if (found) return found;
        }
        return null;
    }

    if (value && typeof value === 'object') {
        for (const nested of Object.values(value as Record<string, unknown>)) {
            const found = extractFirstErrorText(nested);
            if (found) return found;
        }
    }

    return null;
};

const normalizeBackendData = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const getNestedValue = (source: unknown, path: string[]): unknown => {
    let current: unknown = source;
    for (const key of path) {
        if (!current || typeof current !== 'object' || !(key in (current as Record<string, unknown>))) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
};

const SignupFormLoader = () => {
    const { isSubmitting } = useFormikContext<SignupFormValues>();
    return <FormLoader visible={isSubmitting} message="Creating your member account..." />;
};

const TermsError = () => {
    const { errors, touched } = useFormikContext<SignupFormValues>();
    return <AppErrorMessage error={errors.agree_to_terms as string} visible={Boolean(touched.agree_to_terms)} />;
};

const SignupScreen = () => {
    const colors = useColors();
    const { signup, loginWithGoogle } = useAuth();
    const scrollViewRef = useRef<ScrollView>(null);
    const [apiError, setApiError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [ageModalVisible, setAgeModalVisible] = useState(false);

    const isAtLeast18 = (dateOfBirth: string) => {
        const [year, month, day] = dateOfBirth.split('-').map(Number);
        if (!year || !month || !day) return false;

        const today = new Date();
        const eighteenYearsAgo = new Date(
            Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate())
        );
        const birthDate = new Date(Date.UTC(year, month - 1, day));

        return birthDate <= eighteenYearsAgo;
    };

    const androidPackage = Constants.expoConfig?.android?.package || 'com.thefourthbook.app';
    const googleRedirectUri = AuthSession.makeRedirectUri({
        native: `${androidPackage}://oauthredirect`,
    });

    const [googleRequest, googleResponse, promptGoogleLogin] = Google.useIdTokenAuthRequest({
        clientId: GOOGLE_WEB_CLIENT_ID || undefined,
        androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
        iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
        webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
        redirectUri: googleRedirectUri,
        scopes: ['openid', 'profile', 'email'],
    });

    React.useEffect(() => {
        const sub = Linking.addEventListener('url', ({ url }) => {
            console.log(`[GoogleAuth][signup] Linking callback URL received: ${url}`);
        });
        return () => sub.remove();
    }, []);

    React.useEffect(() => {
        console.log(
            `[GoogleAuth][signup] request_ready=${Boolean(googleRequest)} redirect_uri=${googleRedirectUri} package=${
                Constants.expoConfig?.android?.package ?? 'n/a'
            }`
        );
    }, [googleRequest, googleRedirectUri]);

    React.useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (event) => {
            setKeyboardHeight(event.endCoordinates.height);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    React.useEffect(() => {
        const runGoogleAuth = async () => {
            if (googleResponse) {
                console.log(`[GoogleAuth][signup] response_type=${googleResponse.type}`);
                if (googleResponse.type === 'error') {
                    console.log(
                        `[GoogleAuth][signup] response_error=${JSON.stringify((googleResponse as any).error ?? {})}`
                    );
                }
                if ((googleResponse as any)?.params) {
                    const params = (googleResponse as any).params as Record<string, string>;
                    console.log(
                        `[GoogleAuth][signup] response_params_keys=${Object.keys(params).join(',')}`
                    );
                }
            }
            if (googleResponse?.type !== 'success') return;
            const idToken = (googleResponse.params as Record<string, string | undefined>)?.id_token;
            if (!idToken) {
                setApiError('Google sign-up failed: missing id token.');
                console.log('[GoogleAuth][signup] missing id_token in success response');
                return;
            }

            try {
                setIsGoogleLoading(true);
                setApiError('');
                console.log('[GoogleAuth][signup] exchanging id_token with backend /auth/google/');
                await loginWithGoogle(idToken);
                console.log('[GoogleAuth][signup] backend exchange success, navigating to tabs');
                router.replace('/(tabs)' as Href);
            } catch (error: any) {
                console.log(
                    `[GoogleAuth][signup] backend exchange failed status=${error?.response?.status} data=${JSON.stringify(
                        error?.response?.data ?? {}
                    )}`
                );
                const data = normalizeBackendData(error?.response?.data);
                const parsedError =
                    extractFirstErrorText(getNestedValue(data, ['error', 'details'])) ||
                    extractFirstErrorText(getNestedValue(data, ['error', 'message'])) ||
                    extractFirstErrorText(getNestedValue(data, ['detail'])) ||
                    extractFirstErrorText(getNestedValue(data, ['message'])) ||
                    extractFirstErrorText(getNestedValue(data, ['error'])) ||
                    'Google sign-up failed. Please try again.';
                setApiError(parsedError);
            } finally {
                setIsGoogleLoading(false);
            }
        };

        void runGoogleAuth();
    }, [googleResponse, loginWithGoogle]);

    const handleSubmit = async (
        values: SignupFormValues,
        { resetForm }: FormikHelpers<SignupFormValues>
    ) => {
        if (!isAtLeast18(values.date_of_birth)) {
            setAgeModalVisible(true);
            return;
        }

        try {
            setApiError('');
            setSuccessMessage('');

            const payload: SignupRequest = {
                email: values.email.trim(),
                password: values.password,
                re_password: values.confirm_password,
                first_name: values.first_name.trim(),
                last_name: values.last_name.trim(),
                phone: values.phone.trim(),
                date_of_birth: values.date_of_birth,
                agree_to_terms: values.agree_to_terms,
            };

            await signup(payload);

            setSuccessMessage('Account created. Enter the verification code to continue.');
            resetForm();
            router.replace({
                pathname: '/(auth)/verify-code',
                params: { email: payload.email },
            });
        } catch (error: any) {
            const toErrorPreview = (value: unknown): string | unknown => {
                if (typeof value === 'string') return value.slice(0, 500);
                try {
                    return JSON.stringify(value).slice(0, 500);
                } catch {
                    return value;
                }
            };

            const logPayload = {
                message: error?.message,
                status: error?.response?.status,
                data_preview: toErrorPreview(error?.response?.data),
            };
            console.log(`[SignupScreen] signup failed :: ${JSON.stringify(logPayload)}`);
            console.error(`[SignupScreen] signup failed :: ${JSON.stringify(logPayload)}`);
            const data = normalizeBackendData(error?.response?.data);
            console.log(
                `[SignupScreen] backend response data (raw) :: ${
                    typeof data === 'string' ? data : JSON.stringify(data)
                }`
            );

            const parsedError =
                extractFirstErrorText(getNestedValue(data, ['error', 'details', 'error', 'details', 'email'])) ||
                extractFirstErrorText(getNestedValue(data, ['error', 'details', 'error', 'details'])) ||
                extractFirstErrorText(getNestedValue(data, ['error', 'details', 'error', 'message'])) ||
                extractFirstErrorText(getNestedValue(data, ['error', 'details', 'email'])) ||
                extractFirstErrorText(getNestedValue(data, ['error', 'details'])) ||
                extractFirstErrorText(getNestedValue(data, ['error', 'message'])) ||
                extractFirstErrorText(getNestedValue(data, ['detail'])) ||
                extractFirstErrorText(getNestedValue(data, ['message'])) ||
                extractFirstErrorText(getNestedValue(data, ['error'])) ||
                'Registration failed. Please review your details and try again.';

            setApiError(parsedError);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    const handleGoogleSignUp = async () => {
        if (!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_IOS_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
            setApiError('Google login is not configured yet. Add Google client IDs in app config.');
            return;
        }

        console.log(`[GoogleAuth][signup] redirect_uri=${googleRedirectUri}`);
        console.log(
            `[GoogleAuth][signup] client_ids :: android=${Boolean(GOOGLE_ANDROID_CLIENT_ID)} ios=${Boolean(
                GOOGLE_IOS_CLIENT_ID
            )} web=${Boolean(GOOGLE_WEB_CLIENT_ID)}`
        );
        setApiError('');
        const result = await promptGoogleLogin();
        console.log(`[GoogleAuth][signup] prompt_result_type=${result.type}`);
    };

    return (
        <Screen>
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
            >
                <ScrollView
                    ref={scrollViewRef}
                    className="flex-1"
                    contentContainerStyle={{
                        paddingVertical: 24,
                        paddingBottom: Math.max(56, keyboardHeight + 24),
                    }}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                >
                    <View
                        className="rounded-2xl border p-5"
                        style={{ backgroundColor: colors.backgroundAlt, borderColor: colors.border }}
                    >
                        <AppText className="mb-2 text-2xl font-bold">Register as a Member</AppText>
                        <AppText className="mb-5 text-sm" color={colors.textSecondary}>
                            Join our community and complete your account setup.
                        </AppText>

                        <AppForm<SignupFormValues>
                            initialValues={{
                                email: '',
                                phone: '',
                                password: '',
                                confirm_password: '',
                                first_name: '',
                                last_name: '',
                                date_of_birth: '',
                                agree_to_terms: false,
                            }}
                            onSubmit={handleSubmit}
                            validationSchema={SignupValidationSchema}
                        >
                            <SignupFormLoader />
                            {apiError ? <AppErrorMessage error={apiError} visible /> : null}
                            {successMessage ? (
                                <View
                                    className="rounded-lg p-3"
                                    style={{ backgroundColor: `${colors.success}15`, borderWidth: 1, borderColor: `${colors.success}55` }}
                                >
                                    <AppText className="text-sm font-semibold" color={colors.success}>
                                        {successMessage}
                                    </AppText>
                                </View>
                            ) : null}

                            <AppFormField
                                name="first_name"
                                label="First Name"
                                placeholder="Enter first name"
                                required
                            />
                            <AppFormField
                                name="last_name"
                                label="Last Name"
                                placeholder="Enter last name"
                                required
                            />
                            <AppFormField
                                name="email"
                                label="Email"
                                type="email"
                                placeholder="Enter email"
                                required
                                icon="email"
                            />
                            <AppFormField
                                name="phone"
                                label="Phone Number"
                                type="tel"
                                placeholder="e.g. +1234567890"
                                required
                            />
                            <AppFormField
                                name="date_of_birth"
                                label="Date of Birth"
                                type="date"
                                required
                                max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                            />
                            <AppFormField
                                name="password"
                                label="Password"
                                type="password"
                                placeholder="Create a strong password"
                                required
                                icon="eye"
                                iconAria="Toggle password visibility"
                            />
                            <AppFormField
                                name="confirm_password"
                                label="Confirm Password"
                                type="password"
                                placeholder="Confirm your password"
                                required
                                icon="eye"
                                iconAria="Toggle password visibility"
                            />

                            <ToggleField
                                name="agree_to_terms"
                                label="I agree to the terms and conditions"
                                description="You must agree before creating your account."
                            />
                            <TouchableOpacity
                                onPress={() => router.push('/terms' as Href)}
                                accessibilityRole="button"
                                accessibilityLabel="View terms and conditions"
                            >
                                <AppText className="text-sm font-semibold" color={colors.accent}>
                                    Read Terms and Conditions
                                </AppText>
                            </TouchableOpacity>
                            <TermsError />

                            <SubmitButton title="Register as a Member" />
                        </AppForm>

                        {/*
                        <View className="my-4 flex-row items-center">
                            <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
                            <AppText className="mx-3 text-xs" color={colors.textSecondary}>
                                OR
                            </AppText>
                            <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
                        </View>

                        <TouchableOpacity
                            onPress={handleGoogleSignUp}
                            disabled={!googleRequest || isGoogleLoading}
                            className="flex-row items-center justify-center rounded-xl border px-4 py-3"
                            style={{ borderColor: colors.border, backgroundColor: colors.background }}
                        >
                            <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
                            <AppText className="ml-2 font-semibold">
                                {isGoogleLoading ? 'Connecting...' : 'Register with Google'}
                            </AppText>
                        </TouchableOpacity>
                        */}

                        <View className="mt-5 flex-row justify-center">
                            <AppText className="text-sm" color={colors.textSecondary}>
                                Already a member?{' '}
                            </AppText>
                            <TouchableOpacity
                                onPress={() => router.replace('/(auth)/login' as Href)}
                                accessibilityRole="button"
                                accessibilityLabel="Go to login"
                            >
                                <AppText className="text-sm font-semibold" color={colors.accent}>
                                    Sign In
                                </AppText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            <StatusModal
                visible={ageModalVisible}
                title="Age Requirement"
                message="You must be at least 18 years old to sign up."
                variant="info"
                onClose={() => setAgeModalVisible(false)}
            />
        </Screen>
    );
};

export default SignupScreen;
