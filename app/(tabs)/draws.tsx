import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Screen } from '@/components';
import {
    DrawsNavigationGrid,
    LatestDistributionCard
} from '@/components/draws';
import AppText from '@/components/ui/AppText';
import { useColors } from '@/config';
import { DistributionCycle, mockDistributionCycles } from '@/data/dummy.draws';
import { distributionService } from '@/lib/services/distributionService';

export default function DrawsScreen() {
    const router = useRouter();
    const colors = useColors();
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [totalUsers, setTotalUsers] = React.useState(0);
    const [completedDraws, setCompletedDraws] = React.useState(0);
    const [totalWinners, setTotalWinners] = React.useState(0);
    const [latestCycle, setLatestCycle] = React.useState<DistributionCycle | null>(null);

    React.useEffect(() => {
        let isMounted = true;

        const loadDrawsOverview = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [publicStats, history] = await Promise.all([
                    distributionService.getPublicStatistics(),
                    distributionService.getDistributionHistory(),
                ]);

                if (!isMounted) return;
                setTotalUsers(publicStats.platform_stats.total_users ?? 0);
                setCompletedDraws(publicStats.platform_stats.total_draws_completed ?? 0);
                setTotalWinners(publicStats.platform_stats.total_winners ?? 0);
                const latest =
                    history.items.find((item) => item.status === 'completed' && item.beneficiaries_count > 0) ??
                    history.items.find((item) => item.status === 'completed') ??
                    null;
                if (latest) {
                    setLatestCycle({
                        cycle_id: latest.cycle_id,
                        period: latest.period,
                        status: latest.status,
                        total_pool: latest.total_pool,
                        total_participants: latest.total_participants,
                        beneficiaries_count: latest.beneficiaries_count,
                        distribution_date: latest.distribution_date,
                        beneficiaries: [],
                    });
                } else {
                    setLatestCycle(null);
                }
            } catch (err) {
                if (!isMounted) return;
                setError(err instanceof Error ? err.message : 'Could not load draw statistics.');
                setTotalUsers(0);
                setCompletedDraws(0);
                setTotalWinners(0);
                setLatestCycle(mockDistributionCycles[0] ?? null);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        void loadDrawsOverview();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleViewHistory = () => {
        router.push('/draws/history' as any);
    };

    return (
        <Screen>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
            >
                <View className="pt-2">
                    {error ? (
                        <View
                            className="mb-3 mt-3 rounded-2xl border p-3"
                            style={{ borderColor: `${colors.error}40`, backgroundColor: `${colors.error}10` }}
                        >
                            <AppText className="text-sm" style={{ color: colors.error }}>
                                {error}
                            </AppText>
                        </View>
                    ) : null}

                    {isLoading ? (
                        <View className="mt-6 items-center justify-center">
                            <ActivityIndicator color={colors.accent} />
                            <AppText className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
                                Loading draw statistics...
                            </AppText>
                        </View>
                    ) : null}

                    <LinearGradient
                        colors={[colors.primary, colors.primary100]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        className="mb-6 mt-2 rounded-2xl p-4"
                    >
                        <View className="flex-row items-start justify-between">
                            <View className="flex-1 pr-3">
                                <AppText className="text-xs uppercase tracking-wider" color={colors.white}>
                                    Draw Center
                                </AppText>
                                <AppText className="mt-1 text-xl font-bold" color={colors.white}>
                                    Track Every Cycle In One Place
                                </AppText>
                                <AppText className="mt-2 text-xs" color={colors.white}>
                                    View platform activity, explore latest outcomes, and keep up with distribution progress.
                                </AppText>
                            </View>
                            <View className="rounded-full bg-white/20 p-2">
                                <Ionicons name="analytics-outline" size={20} color={colors.white} />
                            </View>
                        </View>
                    </LinearGradient>

                    <View className="mb-6 flex-row" style={{ gap: 10 }}>
                        <View
                            className="flex-1 rounded-2xl border p-3"
                            style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                        >
                            <AppText className="text-xs" style={{ color: colors.textSecondary }}>
                                Users
                            </AppText>
                            <AppText className="mt-1 text-lg font-bold" style={{ color: colors.textPrimary }}>
                                {totalUsers.toLocaleString()}
                            </AppText>
                        </View>
                        <View
                            className="flex-1 rounded-2xl border p-3"
                            style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                        >
                            <AppText className="text-xs" style={{ color: colors.textSecondary }}>
                                Completed Draws
                            </AppText>
                            <AppText className="mt-1 text-lg font-bold" style={{ color: colors.textPrimary }}>
                                {completedDraws.toLocaleString()}
                            </AppText>
                        </View>
                        <View
                            className="flex-1 rounded-2xl border p-3"
                            style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                        >
                            <AppText className="text-xs" style={{ color: colors.textSecondary }}>
                                Winners
                            </AppText>
                            <AppText className="mt-1 text-lg font-bold" style={{ color: colors.textPrimary }}>
                                {totalWinners.toLocaleString()}
                            </AppText>
                        </View>
                    </View>

                    {latestCycle ? (
                        <LatestDistributionCard
                            cycle={latestCycle}
                            onPress={handleViewHistory}
                        />
                    ) : null}

                    <DrawsNavigationGrid />
                </View>
            </ScrollView>
        </Screen>
    );
}

