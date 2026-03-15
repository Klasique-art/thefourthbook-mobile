import * as AuthSession from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Href, router } from 'expo-router';
import { FormikHelpers, useFormikContext } from 'formik';
import React, { useState } from 'react';
import {
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
import AppText from '@/components/ui/AppText';
import Screen from '@/components/ui/Screen';
import { useColors } from '@/config/colors';
import {
    GOOGLE_ANDROID_CLIENT_ID,
    GOOGLE_IOS_CLIENT_ID,
    GOOGLE_WEB_CLIENT_ID,
} from '@/config/settings';
import { useAuth } from '@/context/AuthContext';
import { LoginFormValues, LoginValidationSchema } from '@/data/authValidation';

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

const extractApiErrorMessage = (data: any, fallback: string): string => {
    return (
        extractFirstErrorText(data?.error?.details?.error?.details?.detail) ||
        extractFirstErrorText(data?.error?.details?.error?.details) ||
        extractFirstErrorText(data?.error?.details?.error?.message) ||
        extractFirstErrorText(data?.error?.details?.message) ||
        extractFirstErrorText(data?.error?.message) ||
        extractFirstErrorText(data?.detail) ||
        extractFirstErrorText(data?.message) ||
        extractFirstErrorText(data?.error?.details) ||
        extractFirstErrorText(data?.error) ||
        fallback
    );
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

const LoginFormLoader = () => {
    const { isSubmitting } = useFormikContext<LoginFormValues>();
    return <FormLoader visible={isSubmitting} message="Signing you in..." />;
};

const LoginScreen = () => {
    const colors = useColors();
    const { login, loginWithGoogle } = useAuth();
    const [apiError, setApiError] = useState('');
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

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
            console.log(`[GoogleAuth][login] Linking callback URL received: ${url}`);
        });
        return () => sub.remove();
    }, []);

    React.useEffect(() => {
        console.log(
            `[GoogleAuth][login] request_ready=${Boolean(googleRequest)} redirect_uri=${googleRedirectUri} package=${
                Constants.expoConfig?.android?.package ?? 'n/a'
            }`
        );
    }, [googleRequest, googleRedirectUri]);

    const handleSubmit = async (
        values: LoginFormValues,
        { resetForm }: FormikHelpers<LoginFormValues>
    ) => {
        try {
            setApiError('');

            await login({
                email: values.email.trim(),
                password: values.password,
            });

            resetForm();
            router.replace('/(tabs)' as Href);
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
            console.log(`[LoginScreen] login failed :: ${JSON.stringify(logPayload)}`);
            console.error(`[LoginScreen] login failed :: ${JSON.stringify(logPayload)}`);
            const data = normalizeBackendData(error?.response?.data);
            const status = error?.response?.status;
            const verificationRequired =
                status === 403 &&
                (getNestedValue(data, ['data', 'verification_required']) === true ||
                    getNestedValue(data, ['verification_required']) === true ||
                    getNestedValue(data, ['error', 'details', 'data', 'verification_required']) === true);

            if (verificationRequired) {
                const pendingEmail =
                    String(
                        getNestedValue(data, ['data', 'email']) ||
                            getNestedValue(data, ['email']) ||
                            getNestedValue(data, ['error', 'details', 'data', 'email']) ||
                            values.email
                    ).trim();
                setApiError('Please verify your email before logging in.');
                router.replace({
                    pathname: '/(auth)/verify-code',
                    params: { email: pendingEmail },
                });
                return;
            }

            const parsedError = extractApiErrorMessage(
                data,
                'Login failed. Please check your email and password.'
            );

            setApiError(parsedError);
        }
    };

    React.useEffect(() => {
        const run = async () => {
            if (googleResponse) {
                console.log(`[GoogleAuth][login] response_type=${googleResponse.type}`);
                if (googleResponse.type === 'error') {
                    console.log(
                        `[GoogleAuth][login] response_error=${JSON.stringify((googleResponse as any).error ?? {})}`
                    );
                }
                if ((googleResponse as any)?.params) {
                    const params = (googleResponse as any).params as Record<string, string>;
                    console.log(
                        `[GoogleAuth][login] response_params_keys=${Object.keys(params).join(',')}`
                    );
                }
            }
            if (googleResponse?.type !== 'success') return;
            const idToken = (googleResponse.params as Record<string, string | undefined>)?.id_token;
            if (!idToken) {
                setApiError('Google sign-in failed: missing id token.');
                console.log('[GoogleAuth][login] missing id_token in success response');
                return;
            }

            try {
                setIsGoogleLoading(true);
                setApiError('');
                console.log('[GoogleAuth][login] exchanging id_token with backend /auth/google/');
                await loginWithGoogle(idToken);
                console.log('[GoogleAuth][login] backend exchange success, navigating to tabs');
                router.replace('/(tabs)' as Href);
            } catch (error: any) {
                console.log(
                    `[GoogleAuth][login] backend exchange failed status=${error?.response?.status} data=${JSON.stringify(
                        error?.response?.data ?? {}
                    )}`
                );
                const data = error?.response?.data;
                const parsedError = extractApiErrorMessage(
                    data,
                    'Google sign-in failed. Please try again.'
                );
                setApiError(parsedError);
            } finally {
                setIsGoogleLoading(false);
            }
        };

        void run();
    }, [googleResponse, loginWithGoogle]);

    const handleGoogleSignIn = async () => {
        if (!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_IOS_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
            setApiError('Google login is not configured yet. Add Google client IDs in app config.');
            return;
        }

        console.log(`[GoogleAuth][login] redirect_uri=${googleRedirectUri}`);
        console.log(
            `[GoogleAuth][login] client_ids :: android=${Boolean(GOOGLE_ANDROID_CLIENT_ID)} ios=${Boolean(
                GOOGLE_IOS_CLIENT_ID
            )} web=${Boolean(GOOGLE_WEB_CLIENT_ID)}`
        );
        setApiError('');
        const result = await promptGoogleLogin();
        console.log(`[GoogleAuth][login] prompt_result_type=${result.type}`);
    };

    return (
        <Screen>
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
            >
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ paddingVertical: 24, paddingBottom: 40 }}
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
                        <AppText className="mb-2 text-2xl font-bold">Welcome Back</AppText>
                        <AppText className="mb-5 text-sm" color={colors.textSecondary}>
                            Welcome to The Fourth Book. Sign in to continue.
                        </AppText>

                        <AppForm<LoginFormValues>
                            initialValues={{ email: '', password: '' }}
                            onSubmit={handleSubmit}
                            validationSchema={LoginValidationSchema}
                        >
                            <LoginFormLoader />
                            {apiError ? <AppErrorMessage error={apiError} visible /> : null}

                            <AppFormField<LoginFormValues>
                                name="email"
                                label="Email"
                                type="email"
                                placeholder="Enter your email"
                                required
                                icon="email"
                            />

                            <AppFormField<LoginFormValues>
                                name="password"
                                label="Password"
                                type="password"
                                placeholder="Enter your password"
                                required
                                icon="eye"
                                iconAria="Toggle password visibility"
                            />

                            <SubmitButton title="Sign In" />
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
                            onPress={handleGoogleSignIn}
                            disabled={!googleRequest || isGoogleLoading}
                            className="flex-row items-center justify-center rounded-xl border px-4 py-3"
                            style={{ borderColor: colors.border, backgroundColor: colors.background }}
                        >
                            <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
                            <AppText className="ml-2 font-semibold">
                                {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
                            </AppText>
                        </TouchableOpacity>
                        */}

                        <View className="mt-5 gap-3">
                            <TouchableOpacity
                                onPress={() => router.push('/(auth)/forgot-password' as Href)}
                                accessibilityRole="button"
                                accessibilityLabel="Go to forgot password"
                            >
                                <AppText className="text-center text-sm font-semibold" color={colors.accent}>
                                    Forgot Password?
                                </AppText>
                            </TouchableOpacity>
                            <View className="flex-row justify-center">
                                <AppText className="text-sm" color={colors.textSecondary}>
                                    No account yet?{' '}
                                </AppText>
                                <TouchableOpacity
                                    onPress={() => router.push('/(auth)/signup' as Href)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Go to signup"
                                >
                                    <AppText className="text-sm font-semibold" color={colors.accent}>
                                        Register as a Member
                                    </AppText>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </Screen>
    );
};

export default LoginScreen;
