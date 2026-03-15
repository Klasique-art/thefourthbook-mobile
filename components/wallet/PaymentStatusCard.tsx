import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

import { useColors } from '@/config';

import AppText from '@/components/ui/AppText';
interface PaymentStatusCardProps {
    status: 'paid' | 'unpaid' | 'processing';
    amount: number;
    nextDueDate: string;
    dueLabelOverride?: string | null;
    onPayPress: () => void;
    isProcessing?: boolean;
    canPayNow?: boolean;
    payDisabledReason?: string | null;
    checkoutQuoteLabel?: string | null;
}

const PaymentStatusCard = ({
    status,
    amount,
    nextDueDate,
    dueLabelOverride,
    onPayPress,
    isProcessing,
    canPayNow = true,
    payDisabledReason,
    checkoutQuoteLabel,
}: PaymentStatusCardProps) => {
    const colors = useColors();
    const isPaid = status === 'paid';

    return (
        <LinearGradient
            colors={isPaid ? [colors.success, '#145A0A'] : [colors.warning, '#C4902C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="p-6 mb-6"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5, borderRadius: 12 }}
        >
            <View className="flex-row justify-between items-start mb-4">
                <View>
                    <AppText className="text-sm font-bold uppercase tracking-wider mb-1">
                        Current Status
                    </AppText>
                    <View className="flex-row items-center">
                        <View className={`w-2 h-2 rounded-full mr-2 bg-white`} />
                        <AppText className="text-xl font-bold">
                            {isPaid ? "Active & Covered" : "Action Required"}
                        </AppText>
                    </View>
                </View>
                <View className="bg-white/20 p-2 rounded-full">
                    <Ionicons
                        name={isPaid ? "shield-checkmark" : "alert"}
                        size={24}
                        color="#FFF"
                    />
                </View>
            </View>

            <View className="flex-row items-end mb-6">
                <AppText className="text-4xl font-extrabold mr-1">
                    ${amount.toFixed(2)}
                </AppText>
                <AppText className="text-lg mb-1 font-medium">/ cycle</AppText>
            </View>
            {checkoutQuoteLabel ? (
                <AppText className="text-xs mb-4" color="#FFFFFF">
                    {checkoutQuoteLabel}
                </AppText>
            ) : null}

            <View className="flex-row justify-between items-center">
                <View>
                    <AppText className="text-xs">
                        {isPaid ? "Next Payment Due" : "Payment Due By"}
                    </AppText>
                    <AppText className="font-bold">
                        {dueLabelOverride
                            ? dueLabelOverride
                            : new Date(nextDueDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    </AppText>
                </View>

                {!isPaid && canPayNow && (
                    <TouchableOpacity
                        onPress={onPayPress}
                        disabled={isProcessing}
                        className="bg-white px-6 py-3 rounded-full flex-row items-center"
                        style={{ shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 }}
                    >
                        {isProcessing ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <>
                                <AppText style={{ color: colors.primary, fontWeight: 'bold' }} className="mr-2">
                                    Pay Now
                                </AppText>
                                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                            </>
                        )}
                    </TouchableOpacity>
                )}
                {!isPaid && !canPayNow && (
                    <View className="max-w-[55%]">
                        <AppText className="text-xs font-semibold text-right">
                            {payDisabledReason ?? 'Contributions are currently closed for this cycle.'}
                        </AppText>
                    </View>
                )}
            </View>
        </LinearGradient>
    );
};

export default PaymentStatusCard;

