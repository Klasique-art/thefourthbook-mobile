import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import React from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, View } from 'react-native';

import { Screen } from '@/components';
import AppText from '@/components/ui/AppText';
import { useColors } from '@/config';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { thresholdGameService } from '@/lib/services/thresholdGameService';
import { isPriorityUser } from '@/lib/userType';
import { DistributionCycleCurrentResponse } from '@/types/threshold-game.types';

export default function PriorityHomeScreen() {
    const { user } = useAuth();
    const colors = useColors();
    const { theme } = useTheme();
    const [refreshing, setRefreshing] = React.useState(false);
    const [cycle, setCycle] = React.useState<DistributionCycleCurrentResponse | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [reduceMotionEnabled, setReduceMotionEnabled] = React.useState(false);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;
    const rotateAnim = React.useRef(new Animated.Value(0)).current;
    const floatAnim = React.useRef(new Animated.Value(0)).current;

    const isPriority = isPriorityUser(user);
    const isGameOpen = cycle?.distribution_state === 'threshold_met_game_open' && Boolean(cycle?.game?.game_id);
    const statusLine = refreshing
        ? 'Checking game availability...'
        : error
            ? `Game status unavailable. ${error}`
            : 'No game is live right now. Tap anywhere to check again.';
    const isDark = theme === 'dark';
    const gradientColors: [string, string, ...string[]] = isDark
        ? ['#130A05', '#231005', '#110A08']
        : ['#FFF7ED', '#FDEBD8', '#FDF3E5'];
    const auraColor = isDark ? 'rgba(243,130,24,0.12)' : 'rgba(243,130,24,0.18)';
    const ringColor = isDark ? 'rgba(243,130,24,0.35)' : 'rgba(87,18,23,0.24)';
    const ringInnerColor = isDark ? 'rgba(243,130,24,0.24)' : 'rgba(87,18,23,0.16)';
    const headlineColor = isDark ? '#FFF4E8' : '#571217';
    const bodyColor = isDark ? '#FFDCC2' : '#5F4A3D';
    const iconColor = isDark ? '#F7A455' : colors.accent;

    const loadPriorityGameState = React.useCallback(async () => {
        if (!isPriority) return;
        try {
            setError(null);
            const nextCycle = await thresholdGameService.getCurrentCycle();
            setCycle(nextCycle);
        } catch (err: any) {
            setError(String(err?.message || 'Could not load game status right now.'));
        }
    }, [isPriority]);

    useFocusEffect(
        React.useCallback(() => {
            void loadPriorityGameState();
        }, [loadPriorityGameState])
    );

    const onRefresh = React.useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await loadPriorityGameState();
        } finally {
            setRefreshing(false);
        }
    }, [loadPriorityGameState, refreshing]);

    React.useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => {
                if (mounted) setReduceMotionEnabled(Boolean(enabled));
            })
            .catch(() => {
                if (mounted) setReduceMotionEnabled(false);
            });
        const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
            setReduceMotionEnabled(Boolean(enabled));
        });
        return () => {
            mounted = false;
            subscription.remove();
        };
    }, []);

    React.useEffect(() => {
        if (isGameOpen) return;
        if (reduceMotionEnabled) {
            pulseAnim.setValue(1);
            rotateAnim.setValue(0);
            floatAnim.setValue(0);
            return;
        }
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 800,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 800,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );
        const spin = Animated.loop(
            Animated.timing(rotateAnim, {
                toValue: 1,
                duration: 6000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        const floatLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, {
                    toValue: 1,
                    duration: 1800,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(floatAnim, {
                    toValue: 0,
                    duration: 1800,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        spin.start();
        floatLoop.start();
        return () => {
            pulse.stop();
            spin.stop();
            floatLoop.stop();
        };
    }, [floatAnim, isGameOpen, pulseAnim, reduceMotionEnabled, rotateAnim]);

    if (!isPriority) {
        return <Redirect href="/(tabs)" />;
    }
    if (isGameOpen) {
        return <Redirect href="/draws/threshold-game" />;
    }

    const spin = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });
    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-8, 8],
    });

    return (
        <Screen className="pt-0">
            <Pressable
                onPress={() => void onRefresh()}
                accessibilityRole="button"
                accessibilityLabel="Game availability screen"
                accessibilityHint="Double tap to check whether a game is now available."
                accessibilityState={{ busy: refreshing }}
                style={{ flex: 1, marginHorizontal: -16 }}
            >
                <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
                >
                    <Animated.View
                        style={{
                            position: 'absolute',
                            width: 320,
                            height: 320,
                            borderRadius: 160,
                            backgroundColor: auraColor,
                            transform: [{ scale: pulseAnim }],
                        }}
                    />
                    <Animated.View
                        style={{
                            width: 240,
                            height: 240,
                            borderRadius: 120,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1.5,
                            borderColor: ringColor,
                            transform: [{ rotate: spin }],
                        }}
                    >
                        <Animated.View
                            style={{
                                position: 'absolute',
                                width: 168,
                                height: 168,
                                borderRadius: 84,
                                borderWidth: 1,
                                borderColor: ringInnerColor,
                                transform: [{ scale: pulseAnim }, { translateY: floatY }],
                            }}
                        />
                    </Animated.View>
                    <View style={{ position: 'absolute', alignItems: 'center' }}>
                        <Ionicons
                            name="game-controller"
                            size={44}
                            color={iconColor}
                            accessibilityLabel="Game controller icon"
                        />
                        <AppText
                            className="mt-5 text-3xl font-extrabold text-center"
                            style={{ color: headlineColor, letterSpacing: 0.6 }}
                            accessibilityRole="header"
                        >
                            Game Not Available
                        </AppText>
                    </View>

                    <AppText
                        className="absolute text-sm text-center"
                        style={{
                            color: error ? colors.error : bodyColor,
                            lineHeight: 22,
                            bottom: 78,
                            paddingHorizontal: 24,
                        }}
                        accessibilityLiveRegion="polite"
                        accessibilityRole="alert"
                    >
                        {statusLine}
                    </AppText>

                    {refreshing && (
                        <View style={{ position: 'absolute', bottom: 36, alignItems: 'center' }}>
                            <ActivityIndicator color={colors.accent} />
                        </View>
                    )}
                </LinearGradient>
            </Pressable>
        </Screen>
    );
}
