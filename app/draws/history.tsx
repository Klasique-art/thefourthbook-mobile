import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';

import { Nav, Screen } from '@/components';
import AppText from '@/components/ui/AppText';
import { useColors } from '@/config';
import { distributionService } from '@/lib/services/distributionService';
import { DistributionHistoryItem } from '@/types/distribution.types';

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

const formatDistributionDate = (value: string) => {
    const parsed = new Date(value);
    if (!value || Number.isNaN(parsed.getTime())) return 'Not available';
    return parsed.toLocaleDateString('en-US');
};

const statusColorMap: Record<DistributionHistoryItem['status'], string> = {
    active: '#F8B735',
    completed: '#1A760D',
    processing: '#F38218',
};

const DrawsHistoryScreen = () => {
    const colors = useColors();
    const [items, setItems] = React.useState<DistributionHistoryItem[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const loadHistory = React.useCallback(async (silent = false) => {
        if (!silent) {
            setIsLoading(true);
        }
        setError(null);
        try {
            const response = await distributionService.getDistributionHistory();
            setItems(response.items.filter((cycle) => cycle.status === 'completed'));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load distribution history.');
        } finally {
            if (!silent) {
                setIsLoading(false);
            }
        }
    }, []);

    React.useEffect(() => {
        let isMounted = true;
        if (isMounted) {
            void loadHistory();
        }

        return () => {
            isMounted = false;
        };
    }, [loadHistory]);

    const handleRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            await loadHistory(true);
        } finally {
            setRefreshing(false);
        }
    }, [loadHistory]);

    return (
        <Screen>
            <Nav title="All Distributions" />
            {isLoading ? (
                <View className="mt-8 items-center justify-center">
                    <ActivityIndicator color={colors.accent} />
                    <AppText className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
                        Loading distribution history...
                    </AppText>
                </View>
            ) : (
                <FlashList
                    data={items}
                    keyExtractor={(item) => item.cycle_id}
                    ListHeaderComponent={
                        error ? (
                            <View
                                className="mb-3 rounded-2xl border p-3"
                                style={{ borderColor: `${colors.error}40`, backgroundColor: `${colors.error}10` }}
                            >
                                <AppText className="text-sm" style={{ color: colors.error }}>
                                    {error}
                                </AppText>
                            </View>
                        ) : null
                    }
                    ListEmptyComponent={
                        !error ? (
                            <View
                                className="mt-10 items-center rounded-2xl border p-6"
                                style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                            >
                                <Ionicons name="receipt-outline" size={28} color={colors.textSecondary} />
                                <AppText className="mt-3 text-base font-semibold" style={{ color: colors.textPrimary }}>
                                    No distributions yet
                                </AppText>
                                <AppText className="mt-1 text-center text-sm" style={{ color: colors.textSecondary }}>
                                    Completed draws will appear here once available.
                                </AppText>
                            </View>
                        ) : null
                    }
                    contentContainerStyle={{ paddingBottom: 24 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={colors.accent}
                            colors={[colors.accent]}
                            title="Refreshing distributions"
                        />
                    }
                    renderItem={({ item: cycle }) => (
                        <Pressable
                            onPress={() => router.push({ pathname: '/draws/beneficiaries', params: { cycleId: cycle.cycle_id } })}
                            className="mb-3 rounded-2xl border p-4"
                            style={{ borderColor: colors.border, backgroundColor: colors.backgroundAlt }}
                        >
                            <View className="mb-2 flex-row items-center justify-between">
                                <View>
                                    <AppText className="text-base font-bold" style={{ color: colors.textPrimary }}>
                                        {cycle.period}
                                    </AppText>
                                    <AppText className="text-xs" style={{ color: colors.textSecondary }}>
                                        Cycle ID: {cycle.cycle_id}
                                    </AppText>
                                </View>
                                <View
                                    className="rounded-full px-3 py-1"
                                    style={{ backgroundColor: `${statusColorMap[cycle.status]}20` }}
                                >
                                    <AppText className="text-xs font-semibold uppercase" style={{ color: statusColorMap[cycle.status] }}>
                                        {cycle.status}
                                    </AppText>
                                </View>
                            </View>

                            <AppText className="mb-2 text-sm" style={{ color: colors.textSecondary }}>
                                Distribution Date: {formatDistributionDate(cycle.distribution_date)}
                            </AppText>

                            <View className="flex-row items-center justify-between">
                                <View>
                                    <AppText className="text-xs" style={{ color: colors.textSecondary }}>
                                        Total Pool
                                    </AppText>
                                    <AppText className="text-base font-bold" style={{ color: colors.textPrimary }}>
                                        {formatCurrency(cycle.total_pool)}
                                    </AppText>
                                </View>
                                <View className="items-end">
                                    <AppText className="text-xs" style={{ color: colors.textSecondary }}>
                                        Beneficiaries
                                    </AppText>
                                    <AppText className="text-base font-bold" style={{ color: colors.textPrimary }}>
                                        {cycle.beneficiaries_count}
                                    </AppText>
                                </View>
                            </View>

                            <View className="mt-3 flex-row items-center">
                                <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
                                <AppText className="ml-2 text-xs" style={{ color: colors.textSecondary }}>
                                    Participants: {cycle.total_participants.toLocaleString()}
                                </AppText>
                            </View>
                        </Pressable>
                    )}
                />
            )}
        </Screen>
    );
};

export default DrawsHistoryScreen;
