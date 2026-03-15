import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';

import { useColors } from '@/config';
import { WinnerAlertItem } from '@/types/winner-alert.types';

import AppButton from './AppButton';
import AppText from './AppText';

interface WinnerAlertModalProps {
    visible: boolean;
    alert: WinnerAlertItem | null;
    isAcknowledging: boolean;
    acknowledgeError: string | null;
    onAcknowledge: () => void;
}

const statusColorMap: Record<WinnerAlertItem['payout_status'], string> = {
    pending: '#F8B735',
    processing: '#F38218',
    completed: '#1A760D',
    failed: '#DC2626',
};

const formatCurrency = (amount: string, currency: string) => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed)) return `${amount} ${currency}`;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(parsed);
};

const WinnerAlertModal = ({
    visible,
    alert,
    isAcknowledging,
    acknowledgeError,
    onAcknowledge,
}: WinnerAlertModalProps) => {
    const colors = useColors();

    if (!visible || !alert) return null;

    const payoutColor = statusColorMap[alert.payout_status] ?? colors.accent;
    const amountLabel = formatCurrency(alert.prize_amount, alert.currency || 'USD');
    const selectedLabel = alert.selected_at
        ? new Date(alert.selected_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
        : 'N/A';

    return (
        <Modal
            transparent
            visible
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => {}}
        >
            <View
                className="flex-1 justify-center px-5"
                style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
            >
                <View
                    className="rounded-3xl border p-6"
                    style={{ backgroundColor: colors.background, borderColor: `${colors.accent}66` }}
                    accessibilityRole="alert"
                    accessibilityViewIsModal
                >
                    <View className="items-center">
                        <View
                            className="mb-4 h-20 w-20 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${colors.warning}33` }}
                        >
                            <Ionicons name="trophy" size={42} color={colors.warning} />
                        </View>

                        <AppText className="text-center text-2xl font-bold" style={{ color: colors.textPrimary }}>
                            {alert.headline}
                        </AppText>
                        <AppText className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>
                            {alert.message}
                        </AppText>
                    </View>

                    <View
                        className="mt-5 rounded-2xl border p-4"
                        style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                    >
                        <AppText className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                            Prize Amount
                        </AppText>
                        <AppText className="mt-1 text-3xl font-extrabold" style={{ color: colors.accent }}>
                            {amountLabel}
                        </AppText>

                        <View className="mt-3 flex-row items-center justify-between">
                            <AppText className="text-xs" style={{ color: colors.textSecondary }}>
                                Cycle #{alert.cycle_number ?? '-'}
                            </AppText>
                            <View
                                className="rounded-full px-3 py-1"
                                style={{ backgroundColor: `${payoutColor}20` }}
                            >
                                <AppText className="text-xs font-semibold uppercase" style={{ color: payoutColor }}>
                                    {alert.payout_status}
                                </AppText>
                            </View>
                        </View>

                        <AppText className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                            Selected: {selectedLabel}
                        </AppText>
                    </View>

                    {acknowledgeError ? (
                        <View
                            className="mt-4 rounded-xl border p-3"
                            style={{ borderColor: `${colors.error}55`, backgroundColor: `${colors.error}14` }}
                        >
                            <AppText className="text-sm" style={{ color: colors.error }}>
                                {acknowledgeError}
                            </AppText>
                        </View>
                    ) : null}

                    <AppButton
                        title={isAcknowledging ? 'Confirming...' : 'Got it'}
                        icon="checkmark-circle"
                        onClick={onAcknowledge}
                        disabled={isAcknowledging}
                        fullWidth
                        style={{ marginTop: 16 }}
                    />

                    {isAcknowledging ? (
                        <View className="mt-3 flex-row items-center justify-center">
                            <ActivityIndicator size="small" color={colors.accent} />
                            <AppText className="ml-2 text-xs" style={{ color: colors.textSecondary }}>
                                Updating alert status...
                            </AppText>
                        </View>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
};

export default WinnerAlertModal;

