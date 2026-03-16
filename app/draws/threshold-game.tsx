import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    ImageBackground,
    Pressable,
    RefreshControl,
    ScrollView,
    View,
} from 'react-native';

import { AppButton, Nav, Screen } from '@/components';
import AppText from '@/components/ui/AppText';
import StatusModal from '@/components/ui/StatusModal';
import { useColors } from '@/config';
import { paymentService } from '@/lib/services/paymentService';
import { ThresholdGameApiError, thresholdGameService } from '@/lib/services/thresholdGameService';
import { DistributionGameActiveResponse, DistributionState } from '@/types/threshold-game.types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const GAME_REFRESH_INTERVAL_MS = 15000;
const LAST_VERIFIED_PAYMENT_CYCLE_KEY = 'thefourthbook_last_verified_payment_cycle_id';

type AlertState =
    | { tone: 'info' | 'error'; message: string }
    | null;

const toDateTimeLabel = (value: string | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const toTimestamp = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    if (Number.isNaN(parsed)) return null;
    return parsed;
};

const formatRemaining = (remainingMs: number): string => {
    const totalSeconds = Math.max(Math.floor(remainingMs / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const stateToAlert = (state: DistributionState): AlertState => {
    if (state === 'threshold_met_game_open') return null;
    if (state === 'collecting') {
        return { tone: 'info', message: 'Threshold has not been reached yet. The game will open once the pool target is met.' };
    }
    if (state === 'threshold_met_game_pending') {
        return { tone: 'info', message: 'Threshold reached. The game is being prepared and will open shortly.' };
    }
    if (state === 'threshold_met_game_closed') {
        return { tone: 'info', message: 'Game submissions are closed for this cycle.' };
    }
    if (state === 'distribution_processing') {
        return { tone: 'info', message: 'Game is closed and distribution is currently being processed.' };
    }
    return { tone: 'info', message: 'This cycle is completed. A new cycle will appear once backend rollover finalizes.' };
};

const gameStatusToAlert = (status: DistributionGameActiveResponse['status'], startsAt: string, endsAt: string): AlertState => {
    if (status === 'open') return null;
    if (status === 'scheduled') {
        const startsLabel = toDateTimeLabel(startsAt);
        return {
            tone: 'info',
            message: startsLabel ? `Game is scheduled and will open on ${startsLabel}.` : 'Game is scheduled and will open soon.',
        };
    }
    if (status === 'closed') {
        const endedLabel = toDateTimeLabel(endsAt);
        return {
            tone: 'info',
            message: endedLabel ? `Game is closed. Submission ended on ${endedLabel}.` : 'Game is closed for this cycle.',
        };
    }
    return { tone: 'info', message: 'Game is not open right now.' };
};

const ThresholdGameScreen = () => {
    const colors = useColors();
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [game, setGame] = React.useState<DistributionGameActiveResponse | null>(null);
    const [selectedOptionId, setSelectedOptionId] = React.useState<string | null>(null);
    const [alert, setAlert] = React.useState<AlertState>(null);
    const [submittedAt, setSubmittedAt] = React.useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [lastSyncedAt, setLastSyncedAt] = React.useState<string | null>(null);
    const [statusModal, setStatusModal] = React.useState<{
        visible: boolean;
        title: string;
        message: string;
        variant: 'success' | 'error' | 'info';
    }>({
        visible: false,
        title: '',
        message: '',
        variant: 'info',
    });
    const [isEligible, setIsEligible] = React.useState(true);
    const [remainingMs, setRemainingMs] = React.useState<number | null>(null);
    const [endsAtLabel, setEndsAtLabel] = React.useState<string | null>(null);
    const countdownAnchorRef = React.useRef<{ remainingMs: number; capturedAtMs: number } | null>(null);
    const hadOpenGameRef = React.useRef(false);
    const zeroBoundarySyncRef = React.useRef(false);

    const screenIn = React.useRef(new Animated.Value(0)).current;
    const scanAnim = React.useRef(new Animated.Value(0)).current;
    const pulseAnim = React.useRef(new Animated.Value(1)).current;
    const ctaPulseAnim = React.useRef(new Animated.Value(1)).current;
    const successAnim = React.useRef(new Animated.Value(0)).current;
    const orbAnimOne = React.useRef(new Animated.Value(0)).current;
    const orbAnimTwo = React.useRef(new Animated.Value(0)).current;
    const orbAnimThree = React.useRef(new Animated.Value(0)).current;
    const optionEntranceAnims = React.useRef<Animated.Value[]>([]);

    const hasSubmitted = Boolean(game?.submission.has_submitted || submittedAt);
    const isGameOpen = game?.status === 'open';
    const lastUpdatedLabel = React.useMemo(() => toDateTimeLabel(lastSyncedAt), [lastSyncedAt]);
    const remainingLabel = React.useMemo(
        () => (remainingMs !== null ? formatRemaining(remainingMs) : null),
        [remainingMs]
    );

    const openStatusModal = React.useCallback(
        (title: string, message: string, variant: 'success' | 'error' | 'info') => {
            setStatusModal({ visible: true, title, message, variant });
        },
        []
    );

    const closeStatusModal = React.useCallback(() => {
        setStatusModal((prev) => ({ ...prev, visible: false }));
    }, []);

    const syncGame = React.useCallback(async (showLoader = false, manualRefresh = false) => {
        if (showLoader) setIsLoading(true);
        if (manualRefresh) setIsRefreshing(true);

        try {
            const cycle = await thresholdGameService.getCurrentCycle();
            const paymentStatus = await paymentService.getCurrentMonthStatus();
            const paymentHistory = await paymentService.getPaymentHistory();
            const locallyVerifiedCycleId = await AsyncStorage.getItem(LAST_VERIFIED_PAYMENT_CYCLE_KEY);
            const hasSettledPaymentEvidence = paymentHistory.some((payment) => {
                const normalized = String(payment.status || '').toLowerCase();
                const isSettled = normalized === 'success' || normalized === 'completed' || normalized === 'paid';
                if (!isSettled) return false;
                if (paymentStatus.month && payment.month === paymentStatus.month) return true;
                const completedAtMs = payment.completed_at ? new Date(payment.completed_at).getTime() : NaN;
                return !Number.isNaN(completedAtMs) && Date.now() - completedAtMs <= 30 * 60 * 1000;
            });
            const hasLocalCycleProof = locallyVerifiedCycleId === cycle.cycle_id;
            const isPaidForGame = Boolean(paymentStatus.has_paid || hasSettledPaymentEvidence || hasLocalCycleProof);
            console.log(
                `[cycle-payment-check][game-screen] cycle_id=${cycle.cycle_id} has_paid=${String(paymentStatus.has_paid)} has_settled_evidence=${String(hasSettledPaymentEvidence)} local_cycle_proof=${String(hasLocalCycleProof)} paid_for_game=${String(isPaidForGame)} phase=pre-cycle-check`
            );
            if (!isPaidForGame) {
                setGame(null);
                setSelectedOptionId(null);
                setIsEligible(false);
                setAlert({
                    tone: 'info',
                    message:
                        'You are not eligible for this cycle. Complete payment for this cycle to play the threshold game.',
                });
                openStatusModal(
                    'Not Eligible',
                    'You are not eligible to play this cycle because payment has not been completed for this cycle.',
                    'info'
                );
                return;
            }
            console.log(
                `[cycle-payment-check][game-screen] cycle_id=${cycle.cycle_id} has_paid=${String(paymentStatus.has_paid)} has_settled_evidence=${String(hasSettledPaymentEvidence)} local_cycle_proof=${String(hasLocalCycleProof)} paid_for_game=${String(isPaidForGame)} state=${cycle.distribution_state}`
            );
            const cycleAlert = stateToAlert(cycle.distribution_state);
            if (cycleAlert) {
                console.log(
                    `[ThresholdDebug][game-screen] cycle_not_open cycle_id=${cycle.cycle_id} state=${cycle.distribution_state} game_exists=${String(
                        cycle.game?.exists
                    )} game_id=${String(cycle.game?.game_id ?? 'none')} expected_next_transition_at=${String(
                        cycle.expected_next_transition_at ?? 'n/a'
                    )} server_time=${String(cycle.server_time ?? 'n/a')}`
                );
                setGame(null);
                setSelectedOptionId(null);
                setAlert(cycleAlert);
                setIsEligible(true);
                setRemainingMs(null);
                setEndsAtLabel(null);
                countdownAnchorRef.current = null;
                if (hadOpenGameRef.current) {
                    router.replace('/(tabs)' as any);
                }
                return;
            }

            if (!cycle.game.exists || !cycle.game.game_id) {
                console.log(
                    `[ThresholdDebug][game-screen] no_active_game cycle_id=${cycle.cycle_id} state=${cycle.distribution_state} game_exists=${String(
                        cycle.game.exists
                    )} game_id=${String(cycle.game.game_id ?? 'none')} game_status=${String(
                        cycle.game.status ?? 'n/a'
                    )}`
                );
                setGame(null);
                setSelectedOptionId(null);
                setAlert({ tone: 'info', message: 'No active threshold game found right now.' });
                setIsEligible(true);
                setRemainingMs(null);
                setEndsAtLabel(null);
                countdownAnchorRef.current = null;
                if (hadOpenGameRef.current) {
                    router.replace('/(tabs)' as any);
                }
                return;
            }

            const response = await thresholdGameService.getActiveGame(cycle.cycle_id);
            console.log(
                `[ThresholdDebug][game-screen] active_game_loaded cycle_id=${cycle.cycle_id} game_id=${response.game_id} status=${response.status} starts_at=${String(
                    response.starts_at
                )} ends_at=${String(response.ends_at)}`
            );
            setGame(response);

            const serverNowMs = toTimestamp(cycle.server_time) ?? Date.now();
            const expectedNextMs = toTimestamp(cycle.expected_next_transition_at ?? null);
            const gameEndsMs = toTimestamp(response.ends_at);
            const targetEndMs = expectedNextMs ?? gameEndsMs;
            if (response.status === 'open' && targetEndMs) {
                hadOpenGameRef.current = true;
                const nextRemainingMs = Math.max(targetEndMs - serverNowMs, 0);
                setRemainingMs(nextRemainingMs);
                countdownAnchorRef.current = {
                    remainingMs: nextRemainingMs,
                    capturedAtMs: Date.now(),
                };
                setEndsAtLabel(toDateTimeLabel(new Date(targetEndMs).toISOString()));
            } else {
                setRemainingMs(null);
                setEndsAtLabel(toDateTimeLabel(response.ends_at));
                countdownAnchorRef.current = null;
            }

            const statusAlert = gameStatusToAlert(response.status, response.starts_at, response.ends_at);
            if (statusAlert) {
                setIsEligible(true);
                setSelectedOptionId(response.submission.selected_option_id ?? null);
                setSubmittedAt(response.submission.submitted_at ?? null);
                setAlert(statusAlert);
                return;
            }

            try {
                const submission = await thresholdGameService.getMySubmission(response.game_id);
                setIsEligible(true);
                setSelectedOptionId(submission.selected_option_id ?? response.submission.selected_option_id);
                setSubmittedAt(submission.submitted_at ?? response.submission.submitted_at);
                setAlert(null);
            } catch (submissionError: unknown) {
                const submissionApiError = submissionError as ThresholdGameApiError;
                if (submissionApiError?.status === 403) {
                    setIsEligible(false);
                    setSelectedOptionId(response.submission.selected_option_id ?? null);
                    setSubmittedAt(response.submission.submitted_at ?? null);
                    setAlert({
                        tone: 'info',
                        message:
                            submissionApiError.message ||
                            'You are not eligible for this cycle. You need a qualifying contribution/payment before you can play.',
                    });
                    openStatusModal(
                        'Not Eligible',
                        submissionApiError.message ||
                        'You are not eligible for this cycle. You need a qualifying contribution/payment before you can play.',
                        'info'
                    );
                    return;
                }
                throw submissionError;
            }
        } catch (err: unknown) {
            const apiError = err as ThresholdGameApiError;
            if (apiError?.status === 404) {
                console.log(
                    `[ThresholdDebug][game-screen] cycle_or_game_404 status=404 message=${String(
                        apiError?.message || 'n/a'
                    )} data=${JSON.stringify(apiError?.data ?? {})}`
                );
                setGame(null);
                setSelectedOptionId(null);
                setAlert({ tone: 'info', message: 'No cycle is available yet. Please check again shortly.' });
                setIsEligible(true);
                setRemainingMs(null);
                setEndsAtLabel(null);
                countdownAnchorRef.current = null;
            } else {
                console.log(
                    `[ThresholdDebug][game-screen] sync_failed status=${String(apiError?.status ?? 'n/a')} message=${String(
                        apiError?.message || (err instanceof Error ? err.message : 'unknown')
                    )} data=${JSON.stringify(apiError?.data ?? {})}`
                );
                if (
                    apiError?.status === 403 &&
                    String(apiError?.message || '').toLowerCase().includes('not eligible')
                ) {
                    openStatusModal('Not Eligible', apiError.message, 'info');
                }
                setAlert({
                    tone: 'error',
                    message: err instanceof Error ? err.message : 'Could not load game.',
                });
            }
        } finally {
            setLastSyncedAt(new Date().toISOString());
            if (manualRefresh) setIsRefreshing(false);
            if (showLoader) setIsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void syncGame(true);
    }, [syncGame]);

    useFocusEffect(
        React.useCallback(() => {
            void syncGame(false);
            const poller = setInterval(() => {
                void syncGame(false);
            }, GAME_REFRESH_INTERVAL_MS);

            return () => clearInterval(poller);
        }, [syncGame])
    );

    const handleManualRefresh = React.useCallback(() => {
        void syncGame(false, true);
    }, [syncGame]);

    React.useEffect(() => {
        if (!isGameOpen || !countdownAnchorRef.current) {
            return;
        }

        const ticker = setInterval(() => {
            const anchor = countdownAnchorRef.current;
            if (!anchor) return;
            const elapsedMs = Date.now() - anchor.capturedAtMs;
            const nextRemainingMs = Math.max(anchor.remainingMs - elapsedMs, 0);
            setRemainingMs(nextRemainingMs);
        }, 1000);

        return () => clearInterval(ticker);
    }, [isGameOpen]);

    React.useEffect(() => {
        if (!isGameOpen) {
            zeroBoundarySyncRef.current = false;
            return;
        }
        if (remainingMs === null || remainingMs > 0) {
            zeroBoundarySyncRef.current = false;
            return;
        }
        if (zeroBoundarySyncRef.current) return;
        zeroBoundarySyncRef.current = true;
        void syncGame(false);
    }, [isGameOpen, remainingMs, syncGame]);

    React.useEffect(() => {
        const entrance = Animated.timing(screenIn, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });

        const scanLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(scanAnim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        const ctaPulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(ctaPulseAnim, { toValue: 1.03, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(ctaPulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        const orbOneLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(orbAnimOne, { toValue: 1, duration: 4800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(orbAnimOne, { toValue: 0, duration: 4800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        );
        const orbTwoLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(orbAnimTwo, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(orbAnimTwo, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        );
        const orbThreeLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(orbAnimThree, { toValue: 1, duration: 5600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(orbAnimThree, { toValue: 0, duration: 5600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        );

        entrance.start();
        scanLoop.start();
        pulseLoop.start();
        ctaPulseLoop.start();
        orbOneLoop.start();
        orbTwoLoop.start();
        orbThreeLoop.start();

        return () => {
            scanLoop.stop();
            pulseLoop.stop();
            ctaPulseLoop.stop();
            orbOneLoop.stop();
            orbTwoLoop.stop();
            orbThreeLoop.stop();
        };
    }, [screenIn, scanAnim, pulseAnim, ctaPulseAnim, orbAnimOne, orbAnimTwo, orbAnimThree]);

    React.useEffect(() => {
        if (!game) {
            return;
        }

        optionEntranceAnims.current = game.options.map(() => new Animated.Value(0));
        Animated.stagger(
            90,
            optionEntranceAnims.current.map((anim) =>
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 420,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                })
            )
        ).start();
    }, [game]);

    const handleSubmit = async () => {
        if (!game || game.status !== 'open' || !isEligible || !selectedOptionId || hasSubmitted) {
            return;
        }

        setIsSubmitting(true);
        setAlert(null);

        try {
            const result = await thresholdGameService.submitAnswer(game.game_id, {
                selected_option_id: selectedOptionId,
                client_submitted_at: new Date().toISOString(),
            });

            setSubmittedAt(result.submitted_at);
            setGame((prev) =>
                prev
                    ? {
                        ...prev,
                        submission: {
                            has_submitted: true,
                            selected_option_id: result.selected_option_id,
                            submitted_at: result.submitted_at,
                            locked: result.locked,
                        },
                    }
                    : prev
            );

            Animated.spring(successAnim, {
                toValue: 1,
                speed: 14,
                bounciness: 8,
                useNativeDriver: true,
            }).start();
        } catch (err) {
            if (
                err instanceof Error &&
                err.message.toLowerCase().includes('not eligible')
            ) {
                openStatusModal('Not Eligible', err.message, 'info');
            }
            setAlert({
                tone: 'error',
                message: err instanceof Error ? err.message : 'Submission failed.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Screen>
            <Nav title="Threshold Game" />
            <View className="absolute inset-0 overflow-hidden">
                <Animated.View
                    className="absolute rounded-full"
                    style={{
                        width: 220,
                        height: 220,
                        top: 110,
                        left: -50,
                        backgroundColor: `${colors.accent}20`,
                        transform: [
                            { translateY: orbAnimOne.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }) },
                            { translateX: orbAnimOne.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
                        ],
                    }}
                />
                <Animated.View
                    className="absolute rounded-full"
                    style={{
                        width: 170,
                        height: 170,
                        top: 300,
                        right: -30,
                        backgroundColor: `${colors.primary}1F`,
                        transform: [
                            { translateY: orbAnimTwo.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
                            { translateX: orbAnimTwo.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
                        ],
                    }}
                />
                <Animated.View
                    className="absolute rounded-full"
                    style={{
                        width: 140,
                        height: 140,
                        bottom: 60,
                        left: 50,
                        backgroundColor: `${colors.warning}25`,
                        transform: [
                            { translateY: orbAnimThree.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
                            { translateX: orbAnimThree.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
                        ],
                    }}
                />
            </View>

            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={colors.accent} />
                    <AppText className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
                        Loading game...
                    </AppText>
                </View>
            ) : !game ? (
                <View className="flex-1 items-center justify-center px-5">
                    <View
                        className="w-full rounded-2xl border p-4"
                        style={{
                            backgroundColor: colors.backgroundAlt,
                            borderColor: alert?.tone === 'error' ? `${colors.error}55` : `${colors.border}`,
                        }}
                    >
                        <AppText
                            className="text-sm text-center"
                            style={{ color: alert?.tone === 'error' ? colors.error : colors.textSecondary }}
                            accessibilityLiveRegion="polite"
                        >
                            {alert?.message ?? 'No active threshold game right now.'}
                        </AppText>
                        <AppText
                            className="mt-2 text-xs text-center"
                            style={{ color: colors.textSecondary }}
                            accessibilityLiveRegion="polite"
                        >
                            {lastUpdatedLabel ? `Last updated: ${lastUpdatedLabel}` : 'Checking cycle status...'}
                        </AppText>
                        <AppButton
                            title={isRefreshing ? 'Refreshing...' : 'Refresh Status'}
                            icon="refresh"
                            onClick={handleManualRefresh}
                            loading={isRefreshing}
                            disabled={isRefreshing}
                            fullWidth
                            style={{ marginTop: 12 }}
                        />
                        <AppButton
                            title="Back"
                            icon="arrow-back"
                            onClick={() => router.back()}
                            fullWidth
                            style={{ marginTop: 10 }}
                        />
                    </View>
                </View>
            ) : (
                <Animated.View
                    style={{
                        flex: 1,
                        opacity: screenIn,
                        transform: [
                            {
                                translateY: screenIn.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [18, 0],
                                }),
                            },
                        ],
                    }}
                >
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 60 }}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleManualRefresh}
                                tintColor={colors.accent}
                                colors={[colors.accent]}
                                title="Refreshing game status"
                            />
                        }
                    >
                        <View className="mb-1 mt-1 flex-row items-center justify-between">
                            <AppText
                                className="text-xs"
                                style={{ color: colors.textSecondary }}
                                accessibilityLiveRegion="polite"
                            >
                                {lastUpdatedLabel ? `Last updated: ${lastUpdatedLabel}` : 'Checking cycle status...'}
                            </AppText>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Refresh threshold game status"
                                onPress={handleManualRefresh}
                                disabled={isRefreshing}
                            >
                                <AppText
                                    className="text-xs font-semibold"
                                    style={{ color: isRefreshing ? colors.textSecondary : colors.accent }}
                                >
                                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                                </AppText>
                            </Pressable>
                        </View>

                        <LinearGradient
                            colors={[colors.primary, colors.primary100]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ borderRadius: 18, padding: 14, marginTop: 8 }}
                        >
                            <View className="flex-row items-center justify-between">
                                <View className="flex-1 pr-2">
                                    <AppText className="text-xs font-semibold uppercase tracking-wider" color={colors.warning}>
                                        Threshold Met Challenge
                                    </AppText>
                                    <AppText className="text-lg font-bold mt-1" color={colors.white}>
                                        {game?.title ?? 'Guess The Ball Position'}
                                    </AppText>
                                </View>
                                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                                    <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: `${colors.accent}33` }}>
                                        <Ionicons name="sparkles" size={18} color={colors.warning} />
                                    </View>
                                </Animated.View>
                            </View>
                            <View className="mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                                <AppText className="text-xs font-semibold uppercase tracking-wider" color={colors.warning}>
                                    Game Timer
                                </AppText>
                                <AppText className="text-base font-bold mt-1" color={colors.white}>
                                    {remainingLabel ? `Ends in ${remainingLabel}` : 'Countdown unavailable'}
                                </AppText>
                                <AppText className="text-xs mt-1" color={colors.white}>
                                    {endsAtLabel ? `Ends at ${endsAtLabel}` : 'End time unavailable'}
                                </AppText>
                            </View>
                        </LinearGradient>

                        <View
                            className="mt-4 overflow-hidden"
                            style={{
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: `${colors.accent}50`,
                                backgroundColor: colors.backgroundAlt,
                            }}
                        >
                            <ImageBackground
                                source={{ uri: game?.image_url }}
                                resizeMode="cover"
                                style={{ height: 220, justifyContent: 'flex-end' }}
                            >
                                <LinearGradient
                                    colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']}
                                    style={{ flex: 1, justifyContent: 'flex-end', padding: 14 }}
                                >
                                    <Animated.View
                                        style={{
                                            position: 'absolute',
                                            left: 0,
                                            right: 0,
                                            top: 0,
                                            height: 2,
                                            backgroundColor: `${colors.warning}AA`,
                                            transform: [
                                                {
                                                    translateY: scanAnim.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [4, 200],
                                                    }),
                                                },
                                            ],
                                        }}
                                    />
                                    <View
                                        className="self-start px-3 py-1 rounded-full"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                                    >
                                        <AppText className="text-xs font-semibold" color={colors.white}>
                                            Spot The Missing Ball
                                        </AppText>
                                    </View>
                                </LinearGradient>
                            </ImageBackground>
                        </View>

                        <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: colors.backgroundAlt }}>
                            <AppText className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                                Question
                            </AppText>
                            <AppText className="text-lg font-bold mt-1">
                                {game?.prompt_text}
                            </AppText>
                        </View>

                        <View className="mt-4">
                            {game?.options.map((option, index) => {
                                const isSelected = selectedOptionId === option.option_id;
                                const entranceAnim = optionEntranceAnims.current[index];
                                const entranceStyle = entranceAnim
                                    ? {
                                        opacity: entranceAnim,
                                        transform: [
                                            {
                                                translateY: entranceAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [20, 0],
                                                }),
                                            },
                                        ],
                                    }
                                    : undefined;
                                return (
                                    <Animated.View
                                        key={option.option_id}
                                        style={entranceStyle}
                                    >
                                        <AnimatedPressable
                                            onPress={() => isGameOpen && isEligible && !hasSubmitted && setSelectedOptionId(option.option_id)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${option.label}. ${option.text}`}
                                            accessibilityState={{
                                                selected: isSelected,
                                                disabled: hasSubmitted || !isGameOpen || !isEligible,
                                            }}
                                            style={{
                                                borderRadius: 16,
                                                borderWidth: 1.5,
                                                borderColor: isSelected ? colors.accent : `${colors.border}`,
                                                paddingHorizontal: 14,
                                                paddingVertical: 14,
                                                marginBottom: 10,
                                                backgroundColor: isSelected ? `${colors.accent}20` : colors.background,
                                                opacity: (hasSubmitted || !isGameOpen || !isEligible) && !isSelected ? 0.55 : 1,
                                            }}
                                        >
                                            <View className="flex-row items-center justify-between">
                                                <View className="flex-row items-center flex-1 pr-2">
                                                    <View
                                                        className="w-8 h-8 rounded-full items-center justify-center mr-3"
                                                        style={{
                                                            backgroundColor: isSelected ? colors.accent : colors.backgroundAlt,
                                                        }}
                                                    >
                                                        <AppText className="font-bold text-sm" color={isSelected ? colors.white : colors.textPrimary}>
                                                            {option.label}
                                                        </AppText>
                                                    </View>
                                                    <AppText className="text-base font-semibold">{option.text}</AppText>
                                                </View>
                                                {isSelected && (
                                                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                                                )}
                                            </View>
                                        </AnimatedPressable>
                                    </Animated.View>
                                );
                            })}
                        </View>

                        <Animated.View style={{ transform: [{ scale: hasSubmitted ? 1 : ctaPulseAnim }] }}>
                            <AppButton
                                title={hasSubmitted ? 'Answer Submitted' : 'Confirm Answer'}
                                icon={hasSubmitted ? 'checkmark-done-circle' : 'rocket'}
                                onClick={handleSubmit}
                                loading={isSubmitting}
                                disabled={!isGameOpen || !isEligible || !selectedOptionId || hasSubmitted}
                                fullWidth
                                style={{ marginTop: 6 }}
                            />
                        </Animated.View>

                        {alert && (
                            <View
                                className="mt-4 rounded-xl p-3"
                                style={{
                                    backgroundColor:
                                        alert.tone === 'error' ? `${colors.error}15` : `${colors.accent}15`,
                                    borderWidth: 1,
                                    borderColor:
                                        alert.tone === 'error' ? `${colors.error}3A` : `${colors.accent}3A`,
                                }}
                            >
                                <AppText
                                    className="text-sm"
                                    style={{ color: alert.tone === 'error' ? colors.error : colors.textPrimary }}
                                    accessibilityLiveRegion="polite"
                                >
                                    {alert.message}
                                </AppText>
                            </View>
                        )}

                        {hasSubmitted && (
                            <Animated.View
                                className="mt-4 rounded-2xl p-4"
                                style={{
                                    backgroundColor: `${colors.success}18`,
                                    borderColor: `${colors.success}55`,
                                    borderWidth: 1,
                                    opacity: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                                    transform: [
                                        {
                                            scale: successAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.92, 1],
                                            }),
                                        },
                                    ],
                                }}
                            >
                                <View className="flex-row items-center">
                                    <Ionicons name="trophy" size={20} color={colors.success} />
                                    <AppText className="ml-2 text-base font-bold" style={{ color: colors.success }}>
                                        Locked In
                                    </AppText>
                                </View>
                                <AppText className="text-sm mt-2">
                                    Your answer is confirmed. Admin will later pick 10 random users from correct answers for boosted winning chance.
                                </AppText>
                            </Animated.View>
                        )}
                    </ScrollView>
                </Animated.View>
            )}
            <StatusModal
                visible={statusModal.visible}
                title={statusModal.title}
                message={statusModal.message}
                variant={statusModal.variant}
                onClose={closeStatusModal}
            />
        </Screen>
    );
};

export default ThresholdGameScreen;
