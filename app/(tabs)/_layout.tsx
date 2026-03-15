import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { AppState } from 'react-native';

import CustomTabBar from '@/components/layout/CustomTabBar';
import WinnerAlertModal from '@/components/ui/WinnerAlertModal';
import { useAuth } from '@/context/AuthContext';
import { winnerAlertService } from '@/lib/services/winnerAlertService';
import { WinnerAlertItem } from '@/types/winner-alert.types';

const isAckRequired = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    return false;
};

export default function TabsLayout() {
    const { isAuthenticated, isLoading } = useAuth();
    const [winnerAlert, setWinnerAlert] = React.useState<WinnerAlertItem | null>(null);
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [isAcknowledging, setIsAcknowledging] = React.useState(false);
    const [acknowledgeError, setAcknowledgeError] = React.useState<string | null>(null);
    const alertCheckInFlightRef = React.useRef(false);
    const lastAlertCheckAtRef = React.useRef(0);
    const lastAlertErrorLoggedAtRef = React.useRef(0);
    const alertServerErrorBackoffUntilRef = React.useRef(0);

    const checkWinnerAlerts = React.useCallback(async () => {
        if (!isAuthenticated || alertCheckInFlightRef.current) return;
        const now = Date.now();
        if (now < alertServerErrorBackoffUntilRef.current) return;
        if (now - lastAlertCheckAtRef.current < 5000) return;
        alertCheckInFlightRef.current = true;
        lastAlertCheckAtRef.current = now;
        try {
            const payload = await winnerAlertService.getLatest();
            const latest = payload.latest_alert;
            const shouldShow = Boolean(latest) && (isAckRequired(latest?.requires_ack) || Number(payload.unread_count ?? 0) > 0);
            if (latest && shouldShow) {
                setWinnerAlert(latest);
                setAcknowledgeError(null);
                setIsAlertVisible(true);
            }
        } catch (error: any) {
            const status = error?.response?.status;
            if (status >= 500) {
                // Backend error: pause checks briefly to avoid request storms and endless spinner behavior.
                alertServerErrorBackoffUntilRef.current = Date.now() + 60000;
            }
            if (status !== 404 && Date.now() - lastAlertErrorLoggedAtRef.current > 15000) {
                lastAlertErrorLoggedAtRef.current = Date.now();
                console.error('[WinnerAlert] check failed', error);
            }
        } finally {
            alertCheckInFlightRef.current = false;
        }
    }, [isAuthenticated]);

    const handleAcknowledge = React.useCallback(async () => {
        if (!winnerAlert || isAcknowledging) return;
        setIsAcknowledging(true);
        setAcknowledgeError(null);
        try {
            await winnerAlertService.acknowledge(winnerAlert.alert_id);
            setIsAlertVisible(false);
            setWinnerAlert(null);
            void checkWinnerAlerts();
        } catch (error: any) {
            const message = error?.message || 'Could not confirm alert. Please try again.';
            setAcknowledgeError(message);
        } finally {
            setIsAcknowledging(false);
        }
    }, [checkWinnerAlerts, isAcknowledging, winnerAlert]);

    React.useEffect(() => {
        if (!isAuthenticated) return;
        void checkWinnerAlerts();
    }, [checkWinnerAlerts, isAuthenticated]);

    React.useEffect(() => {
        if (!isAuthenticated) return;
        const sub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                void checkWinnerAlerts();
            }
        });
        return () => sub.remove();
    }, [checkWinnerAlerts, isAuthenticated]);

    React.useEffect(() => {
        if (!isAuthenticated) return;
        const poller = setInterval(() => {
            void checkWinnerAlerts();
        }, 30000);
        return () => clearInterval(poller);
    }, [checkWinnerAlerts, isAuthenticated]);

    if (isLoading) return null;
    if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

    return (
        <>
            <Tabs
                tabBar={(props) => <CustomTabBar {...props} />}
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Tabs.Screen name="index" />
                <Tabs.Screen name="dashboard" />
                <Tabs.Screen name="draws" />
                <Tabs.Screen name="wallet" />
                <Tabs.Screen name="profile" />
            </Tabs>
            <WinnerAlertModal
                visible={isAlertVisible}
                alert={winnerAlert}
                isAcknowledging={isAcknowledging}
                acknowledgeError={acknowledgeError}
                onAcknowledge={handleAcknowledge}
            />
        </>
    );
}
