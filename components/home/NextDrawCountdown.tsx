import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Animated, Easing, View } from 'react-native';

import { useColors } from '@/config';
import AppButton from '@/components/ui/AppButton';

import AppText from '@/components/ui/AppText';
interface NextDrawCountdownProps {
    currentPool: number;
    threshold: number;
    beneficiariesCount: number;
    distributionState?: string;
    onPlayGame?: () => void;
    onSimulateThreshold?: () => Promise<void> | void;
}

const NextDrawCountdown = ({
    currentPool,
    threshold,
    beneficiariesCount,
    distributionState,
    onPlayGame,
    onSimulateThreshold,
}: NextDrawCountdownProps) => {
    const colors = useColors();
    const [simulatedPool, setSimulatedPool] = React.useState(currentPool);
    const [isTestMode, setIsTestMode] = React.useState(false);
    const [isSimulating, setIsSimulating] = React.useState(false);
    const normalizedState = String(distributionState || '').toLowerCase();
    const progressPercent = Math.min((simulatedPool / threshold) * 100, 100);
    const remaining = Math.max(threshold - simulatedPool, 0);
    const prizePerBeneficiary = threshold / beneficiariesCount;
    const isCycleCollecting = normalizedState === 'collecting' || normalizedState === 'open' || normalizedState.length === 0;
    const isThresholdMet = isCycleCollecting ? simulatedPool >= threshold : true;
    const isGameOpen = normalizedState === 'threshold_met_game_open' || isTestMode;
    const canEnterGameScreen =
        isGameOpen ||
        normalizedState === 'threshold_met_game_pending' ||
        normalizedState === 'threshold_met_game_closed' ||
        normalizedState === 'distribution_processing';

    const fillAnim = React.useRef(new Animated.Value(progressPercent)).current;
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (isTestMode) return;
        setSimulatedPool(currentPool);
    }, [currentPool, isTestMode]);

    React.useEffect(() => {
        Animated.timing(fillAnim, {
            toValue: progressPercent,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [fillAnim, progressPercent]);

    React.useEffect(() => {
        if (!isThresholdMet) {
            return;
        }

        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 700,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 700,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );

        loop.start();
        return () => loop.stop();
    }, [isThresholdMet, pulseAnim]);

    const handleSimulateThreshold = async () => {
        if (onSimulateThreshold) {
            setIsSimulating(true);
            try {
                await onSimulateThreshold();
            } finally {
                setIsSimulating(false);
            }
            return;
        }
        setIsTestMode(true);
        setSimulatedPool(threshold);
    };

    const handleUseLivePool = () => {
        setIsTestMode(false);
        setSimulatedPool(currentPool);
    };

    return (
        <LinearGradient
            colors={[colors.accent, colors.accent100]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="p-2 mb-6"
            style={{ borderRadius: 16 }}
        >
            <View className="flex-row items-center mb-4">
                <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-1"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                >
                    <Ionicons name="speedometer-outline" size={16} color="#FFFFFF" />
                </View>
                <AppText className="text-lg font-bold" color={colors.white}>
                    Distribution Trigger Progress
                </AppText>
            </View>

            {isThresholdMet ? (
                <Animated.View
                    className="rounded-2xl p-4"
                    style={{
                        backgroundColor: 'rgba(255,255,255,0.18)',
                        transform: [{ scale: pulseAnim }],
                    }}
                >
                    <View className="flex-row items-center justify-between">
                        <View className="mr-3 flex-1">
                            <AppText className="text-lg font-bold" color={colors.white}>
                                {isGameOpen ? 'Threshold Met' : 'Cycle Locked'}
                            </AppText>
                            <AppText className="text-xs mt-1" color={colors.white}>
                                {isGameOpen
                                    ? 'Play this game to get higher chance of winning the next distribution.'
                                    : 'Threshold phase is active. Waiting for the next backend state transition.'}
                            </AppText>
                        </View>
                        <Ionicons name="trophy" size={24} color={colors.white} />
                    </View>

                    {canEnterGameScreen && (
                        <AppButton
                            title="Play Game"
                            icon="game-controller"
                            onClick={onPlayGame}
                            fullWidth
                            style={{ marginTop: 12, backgroundColor: colors.primary }}
                        />
                    )}
                    {isTestMode && (
                        <AppButton
                            title="Back to live pool"
                            variant="outline"
                            size="sm"
                            onClick={handleUseLivePool}
                            fullWidth
                            style={{ marginTop: 8, borderColor: colors.white }}
                        />
                    )}
                </Animated.View>
            ) : (
                <>
                    <View className="items-center mb-4">
                        <AppText className="text-sm mb-2" color={colors.white}>
                            Current Collective Pool
                        </AppText>
                        <AppText className="text-4xl font-bold" color={colors.white}>
                            ${simulatedPool.toLocaleString()}
                        </AppText>
                        <AppText className="text-xs mt-1" color={colors.white}>
                            Distribution runs automatically at ${threshold.toLocaleString()}
                        </AppText>
                    </View>

                    <View className="mb-3">
                        <View className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.28)' }}>
                            <Animated.View
                                className="h-full rounded-full"
                                style={{
                                    width: fillAnim.interpolate({
                                        inputRange: [0, 100],
                                        outputRange: ['0%', '100%'],
                                    }),
                                    backgroundColor: '#FFFFFF',
                                }}
                            />
                        </View>
                        <View className="mt-2 flex-row items-center justify-between">
                            <AppText className="text-xs" color={colors.white}>
                                {progressPercent.toFixed(1)}% reached
                            </AppText>
                            <AppText className="text-xs" color={colors.white}>
                                ${remaining.toLocaleString()} remaining
                            </AppText>
                        </View>
                    </View>

                    <View className="flex-row items-center justify-between mt-1">
                        <AppText className="text-xs" color={colors.white}>
                            {beneficiariesCount} beneficiaries
                        </AppText>
                        <AppText className="text-xs" color={colors.white}>
                            ${prizePerBeneficiary.toLocaleString()} each
                        </AppText>
                    </View>

                    <AppButton
                        title={isSimulating ? 'Updating threshold...' : 'Update Threshold'}
                        variant="outline"
                        size="sm"
                        icon="flash"
                        onClick={handleSimulateThreshold}
                        loading={isSimulating}
                        disabled={isSimulating}
                        fullWidth
                        style={{ marginTop: 12, borderColor: colors.white }}
                    />
                    {isTestMode && (
                        <AppButton
                            title="Back to live pool"
                            variant="outline"
                            size="sm"
                            onClick={handleUseLivePool}
                            fullWidth
                            style={{ marginTop: 8, borderColor: colors.white }}
                        />
                    )}
                </>
            )}
        </LinearGradient>
    );
};

export default NextDrawCountdown;

