import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { AppBottomSheet, type AppBottomSheetRef, AppModal, ConfirmAction, Screen } from '@/components';
import { ProfileHeader, SettingsList } from '@/components/profile';
import AppText from '@/components/ui/AppText';
import { useColors } from '@/config';
import { SupportedLanguage } from '@/config/i18n';
import { ONBOARDING_SEEN_KEY } from '@/data/onboarding';
import { KYC_VERIFIED_KEY } from '@/data/verification';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { mockCurrentUser } from '@/data/userData.dummy';
import { isPriorityUser } from '@/lib/userType';

export default function ProfileScreen() {
    const colors = useColors();
    const { t } = useTranslation();
    const { language, setLanguage } = useLanguage();
    const { logout, user } = useAuth();
    const isPriority = isPriorityUser(user);
    const [isLanguageModalVisible, setIsLanguageModalVisible] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const logoutSheetRef = useRef<AppBottomSheetRef>(null);

    useFocusEffect(
        React.useCallback(() => {
            let isMounted = true;

            const loadVerificationState = async () => {
                try {
                    const storedValue = await AsyncStorage.getItem(KYC_VERIFIED_KEY);
                    if (!isMounted) return;

                    if (storedValue === 'true') {
                        setIsVerified(true);
                        return;
                    }

                    setIsVerified(false);
                } catch {
                    if (isMounted) {
                        setIsVerified(false);
                    }
                }
            };

            void loadVerificationState();

            return () => {
                isMounted = false;
            };
        }, [])
    );

    const languageOptions = useMemo<{ label: string; code: SupportedLanguage }[]>(
        () => [
            { label: 'English', code: 'en' },
            { label: 'French', code: 'fr' },
        ],
        []
    );

    const selectedLanguageLabel = useMemo(
        () => languageOptions.find((item) => item.code === language)?.label || 'English',
        [languageOptions, language]
    );

    const accountSettings = [
        { id: 'account', label: 'Account Details', icon: 'person-outline', route: '/settings/account' },
        ...(!isPriority
            ? [{ id: 'notifications', label: 'Notifications', icon: 'notifications-outline', route: '/notifications' }]
            : []),
    ];

    const appSettings = [
        { id: 'appearance', label: 'Appearance', icon: 'color-palette-outline', route: '/settings/appearance' },
        { id: 'security', label: 'Security', icon: 'lock-closed-outline', route: '/settings/security' },
        {
            id: 'language',
            label: 'Language',
            icon: 'globe-outline',
            value: selectedLanguageLabel,
            action: () => setIsLanguageModalVisible(true)
        },
    ];

    const supportSettings = [
        { id: 'help', label: 'Help & Support', icon: 'help-circle-outline', route: '/settings/support' },
        { id: 'about', label: 'About App', icon: 'information-circle-outline', route: '/settings/about' },
        {
            id: 'replay-onboarding',
            label: 'Replay Onboarding',
            icon: 'sparkles-outline',
            action: async () => {
                await AsyncStorage.removeItem(ONBOARDING_SEEN_KEY);
                router.push('/onboarding');
            }
        },
    ];

    const handleLogout = () => {
        logoutSheetRef.current?.open();
    };

    const handleLogoutCancel = () => {
        logoutSheetRef.current?.close();
    };

    const handleLogoutConfirm = async () => {
        try {
            await logout();
            logoutSheetRef.current?.close();
            router.replace('/(auth)/login');
        } catch (error) {
            console.error('[ProfileScreen] logout failed', error);
            logoutSheetRef.current?.close();
        }
    };

    return (
        <Screen>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <View className="pt-2">
                    <ProfileHeader
                        name={`${user?.first_name ?? mockCurrentUser.first_name} ${user?.last_name ?? mockCurrentUser.last_name}`}
                        email={user?.email ?? mockCurrentUser.email}
                        joinDate={user?.created_at ?? mockCurrentUser.created_at}
                        isVerified={isVerified}
                        onVerifyPress={() => router.push('/verification')}
                    />

                    <SettingsList title="Account" items={accountSettings as any} />
                    <SettingsList title="App Settings" items={appSettings as any} />
                    {!isPriority && <SettingsList title="Support" items={supportSettings as any} />}

                    <SettingsList
                        items={[
                            {
                                id: 'logout',
                                label: 'Log Out',
                                icon: 'log-out-outline',
                                action: handleLogout,
                                isDestructive: true
                            }
                        ] as any}
                    />
                </View>
            </ScrollView>

            <AppModal
                visible={isLanguageModalVisible}
                onClose={() => setIsLanguageModalVisible(false)}
                title="Select Language"
            >
                <View
                    className="rounded-xl border overflow-hidden"
                    style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                >
                    {languageOptions.map((option, index) => {
                        const isSelected = option.code === language;
                        return (
                            <Pressable
                                key={option.code}
                                onPress={async () => {
                                    await setLanguage(option.code);
                                    setIsLanguageModalVisible(false);
                                }}
                                className={`px-4 py-4 flex-row items-center justify-between ${index !== languageOptions.length - 1 ? 'border-b' : ''}`}
                                style={{ borderColor: colors.border }}
                                accessibilityRole="button"
                                accessibilityLabel={t('Use {{language}}', { language: t(option.label) })}
                            >
                                <AppText
                                    className="text-base font-medium"
                                    style={{ color: isSelected ? colors.accent : colors.textPrimary }}
                                >
                                    {option.label}
                                </AppText>
                                {isSelected && (
                                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                                )}
                            </Pressable>
                        );
                    })}
                </View>
            </AppModal>

            <AppBottomSheet
                ref={logoutSheetRef}
                snapPoints={['42%']}
                onClose={handleLogoutCancel}
            >
                <ConfirmAction
                    title="Log Out"
                    desc="Are you sure you want to log out of your account?"
                    confirmBtnTitle="Log Out"
                    isDestructive
                    onConfirm={handleLogoutConfirm}
                    onCancel={handleLogoutCancel}
                />
            </AppBottomSheet>
        </Screen>
    );
}
