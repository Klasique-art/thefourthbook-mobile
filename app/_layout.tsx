import { Stack } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '../global.css';
import '@/config/i18n';
import ServerBreakdownOverlay from '@/components/ui/ServerBreakdownOverlay';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { getApiHealthSnapshot, markApiAvailable, subscribeApiHealth } from '@/lib/apiHealth';

export default function RootLayout() {
  const apiHealth = React.useSyncExternalStore(subscribeApiHealth, getApiHealthSnapshot, getApiHealthSnapshot);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <Stack initialRouteName="index" screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="verification" />
                <Stack.Screen name="terms" />
                <Stack.Screen name="payments/callback" />
                <Stack.Screen name="(tabs)" />
              </Stack>
              {apiHealth.isApiUnavailable && (
                <ServerBreakdownOverlay
                  message={apiHealth.message}
                  onRetry={() => markApiAvailable()}
                />
              )}
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
