import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL } from '@/config/settings';
import AppText from '@/components/ui/AppText';

interface ServerBreakdownOverlayProps {
    message: string;
    onRetry: () => void;
}

const ServerBreakdownOverlay = ({ message, onRetry }: ServerBreakdownOverlayProps) => {
    const insets = useSafeAreaInsets();
    const pulse = React.useRef(new Animated.Value(1)).current;
    const drift = React.useRef(new Animated.Value(0)).current;
    const spin = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1.08,
                    duration: 700,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 700,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );

        const driftLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(drift, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(drift, {
                    toValue: 0,
                    duration: 1500,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );

        const spinLoop = Animated.loop(
            Animated.timing(spin, {
                toValue: 1,
                duration: 2500,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );

        pulseLoop.start();
        driftLoop.start();
        spinLoop.start();
        return () => {
            pulseLoop.stop();
            driftLoop.stop();
            spinLoop.stop();
        };
    }, [drift, pulse, spin]);

    const rotate = spin.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });
    const floatY = drift.interpolate({
        inputRange: [0, 1],
        outputRange: [-6, 6],
    });

    return (
        <View
            style={[
                styles.overlay,
                {
                    paddingTop: insets.top + 24,
                    paddingBottom: insets.bottom + 24,
                },
            ]}
        >
            <Animated.View style={[styles.badge, { transform: [{ scale: pulse }, { translateY: floatY }] }]}>
                <Ionicons name="server-outline" size={28} color="#FFF4E8" />
            </Animated.View>

            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <AppText className="text-xl font-extrabold" style={styles.title}>
                        Server Breakdown
                    </AppText>
                    <Animated.View style={{ transform: [{ rotate }] }}>
                        <Ionicons name="construct-outline" size={20} color="#F38218" />
                    </Animated.View>
                </View>

                <AppText className="text-sm" style={styles.subtitle}>
                    {message}
                </AppText>

                <AppText className="text-xs" style={styles.hint}>
                    Dev API: {API_BASE_URL}
                </AppText>

                <Pressable style={styles.button} onPress={onRetry}>
                    <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
                    <AppText className="text-sm font-bold" style={styles.buttonText}>
                        Retry
                    </AppText>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#130A05',
        zIndex: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    badge: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#F38218',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        shadowColor: '#F38218',
        shadowOpacity: 0.4,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 7,
    },
    card: {
        width: '100%',
        borderRadius: 20,
        backgroundColor: '#211006',
        borderWidth: 1,
        borderColor: '#5B2F12',
        padding: 18,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    title: {
        color: '#FFF4E8',
    },
    subtitle: {
        color: '#FFDCC2',
        lineHeight: 20,
    },
    hint: {
        color: '#D49A72',
        marginTop: 10,
    },
    button: {
        marginTop: 16,
        borderRadius: 10,
        backgroundColor: '#F38218',
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    buttonText: {
        color: '#FFFFFF',
    },
});

export default ServerBreakdownOverlay;

