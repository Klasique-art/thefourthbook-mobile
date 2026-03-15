import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components';
import AppButton from '@/components/ui/AppButton';
import AppText from '@/components/ui/AppText';
import { useColors } from '@/config';
import { drawService } from '@/lib/services/drawService';
import { paymentService } from '@/lib/services/paymentService';

const PENDING_PAYMENT_REFERENCE_KEY = 'thefourthbook_pending_payment_reference';
const LAST_VERIFIED_PAYMENT_CYCLE_KEY = 'thefourthbook_last_verified_payment_cycle_id';

export default function PaymentCallbackScreen() {
    const colors = useColors();
    const router = useRouter();
    const params = useLocalSearchParams<{ reference?: string; trxref?: string }>();

    const [isLoading, setIsLoading] = React.useState(true);
    const [message, setMessage] = React.useState('Finalizing payment...');
    const [success, setSuccess] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;

        const finalizePayment = async () => {
            try {
                const referenceFromUrl = params.reference || params.trxref;
                const referenceFromStorage = await AsyncStorage.getItem(PENDING_PAYMENT_REFERENCE_KEY);
                const reference = referenceFromUrl || referenceFromStorage;

                if (!reference) {
                    throw new Error('No payment reference found to verify.');
                }

                await paymentService.verifyPayment(reference);
                await AsyncStorage.removeItem(PENDING_PAYMENT_REFERENCE_KEY);
                const draw = await drawService.getCurrentDraw();
                if (draw?.draw_id) {
                    await AsyncStorage.setItem(LAST_VERIFIED_PAYMENT_CYCLE_KEY, draw.draw_id);
                }

                if (!mounted) return;
                setSuccess(true);
                setMessage('Payment verified successfully. Returning to Wallet...');
                setTimeout(() => {
                    router.replace('/(tabs)/wallet' as any);
                }, 700);
            } catch (error: any) {
                if (!mounted) return;
                setSuccess(false);
                setMessage(error?.response?.data?.detail || error?.message || 'Payment verification failed.');
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        void finalizePayment();

        return () => {
            mounted = false;
        };
    }, [params.reference, params.trxref, router]);

    return (
        <Screen>
            <View className="flex-1 items-center justify-center px-6">
                {isLoading ? (
                    <ActivityIndicator size="large" color={colors.accent} />
                ) : null}
                <AppText className="mt-4 text-center text-base font-semibold">
                    {message}
                </AppText>

                {!isLoading && !success ? (
                    <AppButton
                        title="Back to Wallet"
                        onClick={() => router.replace('/(tabs)/wallet' as any)}
                        style={{ marginTop: 16 }}
                    />
                ) : null}
            </View>
        </Screen>
    );
}
