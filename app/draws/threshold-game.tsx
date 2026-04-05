import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    GestureResponderEvent,
    ImageBackground,
    LayoutChangeEvent,
    Pressable,
    RefreshControl,
    ScrollView,
    View,
} from 'react-native';

import { AppButton, Nav, Screen } from '@/components';
import AppModal from '@/components/ui/AppModal';
import AppText from '@/components/ui/AppText';
import StatusModal from '@/components/ui/StatusModal';
import { useColors } from '@/config';
import { useAuth } from '@/context/AuthContext';
import { ThresholdGameApiError, thresholdGameService } from '@/lib/services/thresholdGameService';
import { isPriorityUser } from '@/lib/userType';
import {
    DistributionCycleCurrentResponse,
    DistributionGameActiveResponse,
    DistributionState,
    SubmitDistributionGameAnswerPayload,
} from '@/types/threshold-game.types';

const GAME_REFRESH_INTERVAL_MS = 15000;

type AlertState = { tone: 'info' | 'error'; message: string } | null;
type TapPoint = { x: number; y: number } | null;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const clampUnit = (value: number) => Math.min(Math.max(value, -1), 1);

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

const formatRemaining = (remainingMs: number): string => {
    const totalSeconds = Math.max(Math.floor(remainingMs / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
        return { tone: 'info', message: 'Game is closed and distribution is being processed.' };
    }
    return { tone: 'info', message: 'This cycle is completed. A new cycle will appear after rollover.' };
};

const statusToAlert = (game: DistributionGameActiveResponse): AlertState => {
    if (game.status === 'open') return null;
    if (game.status === 'scheduled') {
        const startsLabel = toDateTimeLabel(game.starts_at);
        return { tone: 'info', message: startsLabel ? `Game will open on ${startsLabel}.` : 'Game is scheduled and will open soon.' };
    }
    if (game.status === 'closed') {
        const endsLabel = toDateTimeLabel(game.ends_at);
        return { tone: 'info', message: endsLabel ? `Game closed on ${endsLabel}.` : 'Game is closed for this cycle.' };
    }
    return { tone: 'info', message: 'Game is not open right now.' };
};

const questionText = (game: DistributionGameActiveResponse | null) =>
    game?.question?.trim() || game?.prompt_text?.trim() || 'Tap where you believe the answer is located.';

const ThresholdGameScreen = () => {
    const router = useRouter();
    const { user } = useAuth();
    const colors = useColors();
    const [isLoading, setIsLoading] = React.useState(true);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [game, setGame] = React.useState<DistributionGameActiveResponse | null>(null);
    const [alert, setAlert] = React.useState<AlertState>(null);
    const [selectedTap, setSelectedTap] = React.useState<TapPoint>(null);
    const [submittedTap, setSubmittedTap] = React.useState<TapPoint>(null);
    const [remainingMs, setRemainingMs] = React.useState<number | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = React.useState<string | null>(null);
    const [confirmVisible, setConfirmVisible] = React.useState(false);
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

    const markerPopAnim = React.useRef(new Animated.Value(0)).current;
    const markerRingAnim = React.useRef(new Animated.Value(0)).current;
    const markerTrailAnim = React.useRef(new Animated.Value(0)).current;
    const markerXAnim = React.useRef(new Animated.Value(0)).current;
    const markerYAnim = React.useRef(new Animated.Value(0)).current;
    const imageTiltXAnim = React.useRef(new Animated.Value(0)).current;
    const imageTiltYAnim = React.useRef(new Animated.Value(0)).current;
    const imageDepthAnim = React.useRef(new Animated.Value(1)).current;
    const imageSizeRef = React.useRef({ width: 1, height: 1 });
    const [imageLayoutTick, setImageLayoutTick] = React.useState(0);
    const currentCycleIdRef = React.useRef<string | null>(null);
    const hadOpenGameRef = React.useRef(false);
    const postCloseResyncScheduledRef = React.useRef(false);
    const zeroBoundarySyncRef = React.useRef(false);

    const hasSubmitted = Boolean(game?.submission.has_submitted || submittedTap);
    const markerTap = hasSubmitted ? submittedTap : selectedTap;
    const isGameOpen = game?.status === 'open';
    const remainingLabel = remainingMs !== null ? formatRemaining(remainingMs) : null;
    const lastUpdatedLabel = React.useMemo(() => toDateTimeLabel(lastSyncedAt), [lastSyncedAt]);

    const closeStatusModal = React.useCallback(() => {
        setStatusModal((prev) => ({ ...prev, visible: false }));
    }, []);

    const syncGame = React.useCallback(async (showLoader = false, manualRefresh = false) => {
        if (showLoader) setIsLoading(true);
        if (manualRefresh) setIsRefreshing(true);

        try {
            const cycle: DistributionCycleCurrentResponse = await thresholdGameService.getCurrentCycle();
            const previousCycleId = currentCycleIdRef.current;
            currentCycleIdRef.current = cycle.cycle_id;

            if (previousCycleId && previousCycleId !== cycle.cycle_id) {
                postCloseResyncScheduledRef.current = false;
                setStatusModal({
                    visible: true,
                    title: 'New Cycle Started',
                    message: 'A new cycle is now open. Winner payouts for the previous cycle are being processed.',
                    variant: 'info',
                });
                router.replace((isPriorityUser(user) ? '/(tabs)/priority-home' : '/(tabs)') as any);
                return;
            }

            const cycleAlert = stateToAlert(cycle.distribution_state);
            if (cycleAlert) {
                setGame(null);
                setAlert(cycleAlert);
                setSelectedTap(null);
                setSubmittedTap(null);
                setRemainingMs(null);
                if (
                    hadOpenGameRef.current &&
                    (cycle.distribution_state === 'threshold_met_game_closed' ||
                        cycle.distribution_state === 'distribution_processing' ||
                        cycle.distribution_state === 'distribution_completed') &&
                    !postCloseResyncScheduledRef.current
                ) {
                    postCloseResyncScheduledRef.current = true;
                    setTimeout(() => {
                        postCloseResyncScheduledRef.current = false;
                        void syncGame(false);
                    }, 1500);
                }
                return;
            }

            if (!cycle.game.exists || !cycle.game.game_id) {
                setGame(null);
                setAlert({ tone: 'info', message: 'No active game found right now.' });
                setSelectedTap(null);
                setSubmittedTap(null);
                setRemainingMs(null);
                return;
            }

            const nextGame = await thresholdGameService.getActiveGame(cycle.cycle_id);
            setGame(nextGame);
            setAlert(statusToAlert(nextGame));
            if (nextGame.status === 'open') hadOpenGameRef.current = true;

            if (nextGame.submission.has_submitted && nextGame.submission.tap_x !== null && nextGame.submission.tap_y !== null) {
                const submitted = {
                    x: clamp01(nextGame.submission.tap_x),
                    y: clamp01(nextGame.submission.tap_y),
                };
                setSubmittedTap(submitted);
                setSelectedTap(submitted);
            } else {
                setSubmittedTap(null);
                setSelectedTap(null);
            }

            if (nextGame.status === 'open') {
                const endsAtMs = new Date(nextGame.ends_at).getTime();
                if (!Number.isNaN(endsAtMs)) {
                    setRemainingMs(Math.max(endsAtMs - Date.now(), 0));
                } else {
                    setRemainingMs(null);
                }
            } else {
                setRemainingMs(null);
            }
        } catch (err: unknown) {
            const apiError = err as ThresholdGameApiError;
            setGame(null);
            setSelectedTap(null);
            setSubmittedTap(null);
            setRemainingMs(null);
            setAlert({
                tone: 'error',
                message: apiError?.message || (err instanceof Error ? err.message : 'Could not load game.'),
            });
        } finally {
            setLastSyncedAt(new Date().toISOString());
            if (manualRefresh) setIsRefreshing(false);
            if (showLoader) setIsLoading(false);
        }
    }, [router, user]);

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

    React.useEffect(() => {
        if (!game || game.status !== 'open') return;
        const endsAtMs = new Date(game.ends_at).getTime();
        if (Number.isNaN(endsAtMs)) return;
        const ticker = setInterval(() => {
            setRemainingMs(Math.max(endsAtMs - Date.now(), 0));
        }, 1000);
        return () => clearInterval(ticker);
    }, [game]);

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

    const onImageLayout = React.useCallback((event: LayoutChangeEvent) => {
        imageSizeRef.current = {
            width: Math.max(event.nativeEvent.layout.width, 1),
            height: Math.max(event.nativeEvent.layout.height, 1),
        };
        setImageLayoutTick((prev) => prev + 1);
    }, []);

    const animateMarkerPick = React.useCallback(() => {
        markerPopAnim.setValue(0);
        markerRingAnim.setValue(0);
        markerTrailAnim.setValue(0);
        Animated.parallel([
            Animated.spring(markerPopAnim, {
                toValue: 1,
                useNativeDriver: true,
                damping: 12,
                stiffness: 180,
            }),
            Animated.timing(markerRingAnim, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(markerTrailAnim, {
                toValue: 1,
                duration: 520,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    }, [markerPopAnim, markerRingAnim, markerTrailAnim]);

    const resetImageTilt = React.useCallback(() => {
        Animated.parallel([
            Animated.spring(imageTiltXAnim, {
                toValue: 0,
                damping: 12,
                stiffness: 150,
                mass: 0.7,
                useNativeDriver: true,
            }),
            Animated.spring(imageTiltYAnim, {
                toValue: 0,
                damping: 12,
                stiffness: 150,
                mass: 0.7,
                useNativeDriver: true,
            }),
            Animated.spring(imageDepthAnim, {
                toValue: 1,
                damping: 14,
                stiffness: 160,
                mass: 0.7,
                useNativeDriver: true,
            }),
        ]).start();
    }, [imageDepthAnim, imageTiltXAnim, imageTiltYAnim]);

    const animateImageTilt = React.useCallback(
        (locationX: number, locationY: number, settleBack = false) => {
            const { width, height } = imageSizeRef.current;
            const halfW = Math.max(width / 2, 1);
            const halfH = Math.max(height / 2, 1);
            const dx = (locationX - halfW) / halfW; // -1..1
            const dy = (locationY - halfH) / halfH; // -1..1
            const targetTiltX = clampUnit(-dy) * 5.5;
            const targetTiltY = clampUnit(dx) * 5.5;

            const tiltIn = Animated.parallel([
                Animated.timing(imageTiltXAnim, {
                    toValue: targetTiltX,
                    duration: 140,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(imageTiltYAnim, {
                    toValue: targetTiltY,
                    duration: 140,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(imageDepthAnim, {
                    toValue: 1.015,
                    duration: 140,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]);

            if (!settleBack) {
                tiltIn.start();
                return;
            }

            Animated.sequence([tiltIn, Animated.delay(100)]).start(() => {
                resetImageTilt();
            });
        },
        [imageDepthAnim, imageTiltXAnim, imageTiltYAnim, resetImageTilt]
    );

    React.useEffect(() => {
        if (!markerTap) return;
        const { width, height } = imageSizeRef.current;
        const targetX = markerTap.x * width - 14;
        const targetY = markerTap.y * height - 14;

        if (hasSubmitted) {
            markerXAnim.setValue(targetX);
            markerYAnim.setValue(targetY);
            return;
        }

        Animated.parallel([
            Animated.spring(markerXAnim, {
                toValue: targetX,
                damping: 13,
                stiffness: 190,
                mass: 0.8,
                useNativeDriver: false,
            }),
            Animated.spring(markerYAnim, {
                toValue: targetY,
                damping: 13,
                stiffness: 190,
                mass: 0.8,
                useNativeDriver: false,
            }),
        ]).start();
    }, [hasSubmitted, imageLayoutTick, markerTap, markerXAnim, markerYAnim]);

    const handleImageTap = React.useCallback(
        (event: GestureResponderEvent) => {
            if (!game || game.status !== 'open' || hasSubmitted) return;
            const { locationX, locationY } = event.nativeEvent;
            const { width, height } = imageSizeRef.current;
            const nextTap = {
                x: clamp01(locationX / width),
                y: clamp01(locationY / height),
            };
            setSelectedTap(nextTap);
            animateImageTilt(locationX, locationY, true);
            animateMarkerPick();
            void Haptics.selectionAsync();
        },
        [animateImageTilt, animateMarkerPick, game, hasSubmitted]
    );

    const handleImagePressIn = React.useCallback(
        (event: GestureResponderEvent) => {
            if (!game || game.status !== 'open' || hasSubmitted) return;
            const { locationX, locationY } = event.nativeEvent;
            animateImageTilt(locationX, locationY, false);
        },
        [animateImageTilt, game, hasSubmitted]
    );

    const handleSubmit = React.useCallback(async () => {
        if (!game || !selectedTap || hasSubmitted || game.status !== 'open') return;
        setConfirmVisible(false);
        setIsSubmitting(true);
        try {
            const payload: SubmitDistributionGameAnswerPayload = {
                tap_x: Number(selectedTap.x.toFixed(6)),
                tap_y: Number(selectedTap.y.toFixed(6)),
                client_submitted_at: new Date().toISOString(),
            };
            const result = await thresholdGameService.submitAnswer(game.game_id, payload);
            const lockedTap = {
                x: clamp01(result.tap_x),
                y: clamp01(result.tap_y),
            };
            setSubmittedTap(lockedTap);
            setSelectedTap(lockedTap);
            setGame((prev) =>
                prev
                    ? {
                          ...prev,
                          submission: {
                              ...prev.submission,
                              has_submitted: true,
                              tap_x: lockedTap.x,
                              tap_y: lockedTap.y,
                              submitted_at: result.submitted_at,
                              locked: result.locked,
                              is_correct: result.is_correct ?? prev.submission.is_correct ?? null,
                          },
                      }
                    : prev
            );
            setStatusModal({
                visible: true,
                title: 'Submitted',
                message: 'Your coordinate is locked in for this game.',
                variant: 'success',
            });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (err: unknown) {
            const apiError = err as ThresholdGameApiError;
            if (apiError?.status === 409) {
                await syncGame(false);
                setStatusModal({
                    visible: true,
                    title: 'Already Submitted',
                    message: 'Your answer was already submitted and is locked.',
                    variant: 'info',
                });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } else {
                setStatusModal({
                    visible: true,
                    title: 'Submission Failed',
                    message: apiError?.message || (err instanceof Error ? err.message : 'Submission failed.'),
                    variant: 'error',
                });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [game, hasSubmitted, selectedTap, syncGame]);

    if (isLoading) {
        return (
            <Screen>
                <Nav title="Threshold Game" onPress={() => null} />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={colors.accent} />
                    <AppText className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
                        Loading game...
                    </AppText>
                </View>
            </Screen>
        );
    }

    return (
        <Screen>
            <Nav title="Threshold Game" onPress={() => null} />

            {!game ? (
                <View className="flex-1 items-center justify-center px-4">
                    <View
                        className="w-full rounded-2xl border p-4"
                        style={{
                            backgroundColor: colors.backgroundAlt,
                            borderColor: alert?.tone === 'error' ? `${colors.error}50` : colors.border,
                        }}
                    >
                        <AppText className="text-center text-sm" style={{ color: alert?.tone === 'error' ? colors.error : colors.textSecondary }}>
                            {alert?.message ?? 'No active threshold game right now.'}
                        </AppText>
                        <AppText className="mt-2 text-center text-xs" style={{ color: colors.textSecondary }}>
                            {lastUpdatedLabel ? `Last updated: ${lastUpdatedLabel}` : 'Checking cycle status...'}
                        </AppText>
                        <AppButton
                            title={isRefreshing ? 'Refreshing...' : 'Refresh'}
                            icon="refresh"
                            onClick={() => void syncGame(false, true)}
                            loading={isRefreshing}
                            disabled={isRefreshing}
                            fullWidth
                            style={{ marginTop: 12 }}
                        />
                    </View>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 50 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={() => void syncGame(false, true)}
                            tintColor={colors.accent}
                            colors={[colors.accent]}
                            title="Refreshing game status"
                        />
                    }
                >
                    <LinearGradient
                        colors={[colors.primary, colors.primary100]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ borderRadius: 18, padding: 14, marginTop: 8 }}
                    >
                        <View className="flex-row items-center justify-between">
                            <View className="flex-1 pr-2">
                                <AppText className="text-xs font-semibold uppercase tracking-wider" color={colors.warning}>
                                    Coordinate Challenge
                                </AppText>
                                <AppText className="mt-1 text-lg font-bold" color={colors.white}>
                                    {game.title || 'Find The Right Spot'}
                                </AppText>
                            </View>
                            <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: `${colors.accent}33` }}>
                                <Ionicons name="locate" size={18} color={colors.warning} />
                            </View>
                        </View>
                        <View className="mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                            <AppText className="text-xs font-semibold uppercase tracking-wider" color={colors.warning}>
                                Game Timer
                            </AppText>
                            <AppText className="mt-1 text-base font-bold" color={colors.white}>
                                {remainingLabel ? `Ends in ${remainingLabel}` : 'Timer unavailable'}
                            </AppText>
                            <AppText className="text-xs mt-1" color={colors.white}>
                                {toDateTimeLabel(game.ends_at) ? `Ends at ${toDateTimeLabel(game.ends_at)}` : 'End time unavailable'}
                            </AppText>
                        </View>
                    </LinearGradient>

                    <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: colors.backgroundAlt }}>
                        <AppText className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                            Question
                        </AppText>
                        <AppText className="text-lg font-bold mt-1">{questionText(game)}</AppText>
                        <AppText className="text-xs mt-2" style={{ color: colors.textSecondary }} accessibilityLiveRegion="polite">
                            {hasSubmitted
                                ? 'Your final coordinate is locked.'
                                : selectedTap
                                  ? 'Coordinate selected. You can tap another spot before final submit.'
                                  : 'Tap anywhere on the image to pick a coordinate.'}
                        </AppText>
                    </View>

                    <View className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: `${colors.accent}50` }}>
                        <Pressable
                            onLayout={onImageLayout}
                            onPress={handleImageTap}
                            onPressIn={handleImagePressIn}
                            onPressOut={resetImageTilt}
                            disabled={hasSubmitted || !isGameOpen}
                            accessibilityRole="button"
                            accessibilityLabel="Game image"
                            accessibilityHint={
                                hasSubmitted
                                    ? 'Your answer is locked.'
                                    : 'Double tap the image to choose your coordinate.'
                            }
                            accessibilityState={{ disabled: hasSubmitted || !isGameOpen }}
                        >
                            <Animated.View
                                style={{
                                    width: '100%',
                                    aspectRatio: 4 / 3,
                                    transform: [
                                        { perspective: 900 },
                                        {
                                            rotateX: imageTiltXAnim.interpolate({
                                                inputRange: [-6, 6],
                                                outputRange: ['-6deg', '6deg'],
                                            }),
                                        },
                                        {
                                            rotateY: imageTiltYAnim.interpolate({
                                                inputRange: [-6, 6],
                                                outputRange: ['-6deg', '6deg'],
                                            }),
                                        },
                                        { scale: imageDepthAnim },
                                    ],
                                }}
                            >
                            <ImageBackground source={{ uri: game.image_url }} resizeMode="cover" style={{ width: '100%', height: '100%' }}>
                                <LinearGradient
                                    colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.38)']}
                                    style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}
                                >
                                    <View
                                        className="self-start px-3 py-1 rounded-full"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.24)' }}
                                    >
                                        <AppText className="text-xs font-semibold" color={colors.white}>
                                            Tap The Exact Spot
                                        </AppText>
                                    </View>

                                    {markerTap && (
                                        <Animated.View
                                            style={{
                                                position: 'absolute',
                                                left: markerXAnim,
                                                top: markerYAnim,
                                            }}
                                            pointerEvents="none"
                                        >
                                            {!hasSubmitted && (
                                                <Animated.View
                                                    style={{
                                                        position: 'absolute',
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 14,
                                                        backgroundColor: `${colors.warning}55`,
                                                        opacity: markerTrailAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0.45, 0],
                                                        }),
                                                        transform: [
                                                            {
                                                                scale: markerTrailAnim.interpolate({
                                                                    inputRange: [0, 1],
                                                                    outputRange: [1, 3.1],
                                                                }),
                                                            },
                                                        ],
                                                    }}
                                                />
                                            )}
                                            {!hasSubmitted && (
                                                <Animated.View
                                                    style={{
                                                        position: 'absolute',
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 14,
                                                        borderWidth: 2,
                                                        borderColor: colors.warning,
                                                        opacity: markerRingAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0.7, 0],
                                                        }),
                                                        transform: [
                                                            {
                                                                scale: markerRingAnim.interpolate({
                                                                    inputRange: [0, 1],
                                                                    outputRange: [0.85, 2.1],
                                                                }),
                                                            },
                                                        ],
                                                    }}
                                                />
                                            )}
                                            <Animated.View
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 14,
                                                    backgroundColor: hasSubmitted ? colors.success : colors.warning,
                                                    borderWidth: 2,
                                                    borderColor: '#FFFFFF',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transform: [
                                                        {
                                                            scale: hasSubmitted
                                                                ? 1
                                                                : markerPopAnim.interpolate({
                                                                      inputRange: [0, 1],
                                                                      outputRange: [0.6, 1],
                                                                  }),
                                                        },
                                                    ],
                                                }}
                                            >
                                                <Ionicons
                                                    name={hasSubmitted ? 'checkmark' : 'location'}
                                                    size={14}
                                                    color="#FFFFFF"
                                                />
                                            </Animated.View>
                                        </Animated.View>
                                    )}
                                </LinearGradient>
                            </ImageBackground>
                            </Animated.View>
                        </Pressable>
                    </View>

                    <AppButton
                        title={hasSubmitted ? 'Answer Submitted' : 'Submit Final Choice'}
                        icon={hasSubmitted ? 'checkmark-done-circle' : 'rocket'}
                        onClick={() => setConfirmVisible(true)}
                        loading={isSubmitting}
                        disabled={!isGameOpen || !selectedTap || hasSubmitted || isSubmitting}
                        fullWidth
                        style={{ marginTop: 16 }}
                    />

                    {alert && (
                        <View
                            className="mt-4 rounded-xl p-3"
                            style={{
                                backgroundColor: alert.tone === 'error' ? `${colors.error}15` : `${colors.accent}15`,
                                borderWidth: 1,
                                borderColor: alert.tone === 'error' ? `${colors.error}3A` : `${colors.accent}3A`,
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
                        <View
                            className="mt-4 rounded-2xl p-4"
                            style={{
                                backgroundColor: `${colors.success}18`,
                                borderColor: `${colors.success}55`,
                                borderWidth: 1,
                            }}
                        >
                            <View className="flex-row items-center">
                                <Ionicons name="lock-closed" size={20} color={colors.success} />
                                <AppText className="ml-2 text-base font-bold" style={{ color: colors.success }}>
                                    Locked In
                                </AppText>
                            </View>
                            <AppText className="text-sm mt-2">
                                Your final coordinate was submitted successfully. You cannot submit again for this game.
                            </AppText>
                        </View>
                    )}
                </ScrollView>
            )}

            <AppModal
                visible={confirmVisible}
                onClose={() => setConfirmVisible(false)}
                title="Confirm Final Choice"
            >
                <AppText className="text-sm" style={{ color: colors.textSecondary, lineHeight: 22 }}>
                    Once you submit, your answer is locked and cannot be changed.
                </AppText>
                <View style={{ gap: 10, marginTop: 14 }}>
                    <AppButton
                        title={isSubmitting ? 'Submitting...' : 'Submit Final Choice'}
                        onClick={() => void handleSubmit()}
                        loading={isSubmitting}
                        disabled={isSubmitting}
                        fullWidth
                    />
                    <AppButton
                        title="Keep Editing Spot"
                        variant="outline"
                        onClick={() => setConfirmVisible(false)}
                        fullWidth
                        style={{ borderColor: colors.border }}
                    />
                </View>
            </AppModal>

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
