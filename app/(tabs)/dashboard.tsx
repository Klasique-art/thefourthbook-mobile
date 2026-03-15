import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { Screen } from '@/components';
import {
    ContributionHistoryTimeline,
    ContributionStatusCard,
    DashboardQuickActions,
    DrawEntryStatus,
    ParticipationStatsGrid
} from '@/components/dashboard';
import { DashboardHeader } from '@/components/home';
import AppText from '@/components/ui/AppText';
import { useColors } from '@/config';
import { Contribution } from '@/data/contributions.dummy';
import { ParticipationStats } from '@/data/participationStats.dummy';
import { APP_CONFIG } from '@/data/static.home';
import { dashboardService } from '@/lib/services/dashboardService';
import { DashboardOverviewData } from '@/types/dashboard.types';

export default function DashboardScreen() {
    const colors = useColors();
    const [refreshing, setRefreshing] = useState(false);
    const [overview, setOverview] = useState<DashboardOverviewData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadOverview = useCallback(async () => {
        try {
            setError(null);
            const data = await dashboardService.getOverview();
            setOverview(data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Could not load dashboard.');
        }
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadOverview();
        } finally {
            setRefreshing(false);
        }
    }, [loadOverview]);

    React.useEffect(() => {
        void loadOverview();
    }, [loadOverview]);

    // Calculate greeting based on time
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const memberSince =
        [...(overview?.payment_history ?? [])]
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]?.created_at ??
        new Date().toISOString();
    const totalDrawEntries = Number(overview?.impact?.total_draw_entries ?? 0);
    const totalContributedUsd = totalDrawEntries * APP_CONFIG.CONTRIBUTION_AMOUNT;

    const participationStats: ParticipationStats = {
        total_contributed_amount: totalContributedUsd,
        total_contributions_count: Number(overview?.impact?.total_contribution_count ?? 0),
        total_draw_entries: totalDrawEntries,
        successful_referrals: Number(overview?.referral_stats?.successful_referrals ?? 0),
        member_since: memberSince,
        next_payment_due_date:
            overview?.current_month_contribution_status?.due_date ??
            new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
        is_active_member: Boolean(overview?.eligibility?.is_eligible),
        current_month_status: overview?.current_month_contribution_status?.has_paid_this_cycle ? 'paid' : 'pending',
        current_draw_entry_id:
            overview?.current_month_contribution_status?.draw_entry_token ??
            overview?.current_month_contribution_status?.draw_entry_id ??
            null,
    };

    const contributions: Contribution[] = (overview?.payment_history ?? []).map((item) => {
        const status = String(item.status || '').toLowerCase();
        const mappedStatus: Contribution['status'] =
            status === 'success' || status === 'completed'
                ? 'completed'
                : status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled'
                    ? 'failed'
                    : status === 'refunded'
                        ? 'refunded'
                        : 'pending';

        const methodLabel =
            item.payment_method?.card_brand ||
            item.payment_method?.bank_name ||
            'Payment';
        const methodLast4 =
            item.payment_method?.card_last4 ||
            item.payment_method?.account_number?.slice(-4) ||
            '----';

        return {
            contribution_id: item.payment_id,
            amount: Number(item.amount || 0),
            currency: item.currency || 'USD',
            status: mappedStatus,
            type: 'contribution',
            payment_method: methodLabel,
            payment_method_last4: methodLast4,
            created_at: item.created_at,
            completed_at: item.completed_at,
            draw_month: item.month || participationStats.next_payment_due_date.slice(0, 7),
            draw_entry_id: overview?.eligibility?.entry_id ?? null,
        };
    });

    const currentPool = Number(overview?.cycle_context?.total_pool ?? 0);
    const threshold = Number(overview?.cycle_context?.target_pool ?? 1000000);
    const winnersCount = 10;
    const isEntered = Boolean(overview?.eligibility?.is_entered);
    const userName = overview?.user?.full_name || 'Member';

    return (
        <Screen>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
            >
                <View className=" pt-2">
                    {error ? (
                        <View
                            className="mb-3 rounded-2xl border p-3"
                            style={{ borderColor: `${colors.error}40`, backgroundColor: `${colors.error}10` }}
                        >
                            <AppText className="text-sm" style={{ color: colors.error }}>
                                {error}
                            </AppText>
                        </View>
                    ) : null}

                    <DashboardHeader
                        userName={userName}
                        greeting={greeting}
                    />

                    <ContributionStatusCard stats={participationStats} />

                    <DrawEntryStatus
                        isEntered={isEntered}
                        currentPool={currentPool}
                        threshold={threshold}
                        winnersCount={winnersCount}
                    />

                    <DashboardQuickActions />

                    <ParticipationStatsGrid stats={participationStats} />

                    <ContributionHistoryTimeline contributions={contributions} />
                </View>
            </ScrollView>
        </Screen>
    );
}

