import { useFocusEffect } from '@react-navigation/native';
import { Redirect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Screen } from '@/components';
import AppText from '@/components/ui/AppText';
import StatusModal from '@/components/ui/StatusModal';
import {
    MembershipProgressCard,
    NextDrawCountdown,
    QuickActionsGrid,
    QuickStatsGrid,
    RecentWinnersCarousel,
} from '@/components/home';
import { useColors } from '@/config';
import { useAuth } from '@/context/AuthContext';
import type { DrawWinner } from '@/data/dummy.draws';
import { APP_CONFIG, homeQuickActions } from '@/data/static.home';
import { drawService } from '@/lib/services/drawService';
import { distributionService } from '@/lib/services/distributionService';
import { paymentService } from '@/lib/services/paymentService';
import { ThresholdGameApiError, thresholdGameService } from '@/lib/services/thresholdGameService';
import { isPriorityUser } from '@/lib/userType';
import type { CurrentDraw } from '@/types/draw.types';
const LAST_VERIFIED_PAYMENT_CYCLE_KEY = 'thefourthbook_last_verified_payment_cycle_id';

export default function HomeScreen() {
    const { user } = useAuth();
    const isPriority = isPriorityUser(user);
    const router = useRouter();
    const colors = useColors();
    const [refreshing, setRefreshing] = React.useState(false);
    const [currentDraw, setCurrentDraw] = React.useState<CurrentDraw | null>(null);
    const [hasPaidCurrentCycle, setHasPaidCurrentCycle] = React.useState<boolean | null>(null);
    const [recentWinners, setRecentWinners] = React.useState<DrawWinner[]>([]);
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
    const [isCheckingEligibility, setIsCheckingEligibility] = React.useState(false);

    const currencyFormatter = React.useMemo(
        () =>
            new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            }),
        []
    );

    const formatDateLabel = React.useCallback((value: string | null | undefined) => {
        if (!value) return 'Target-based';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'Target-based';
        return parsed.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }, []);

    const formatPeriodLabel = React.useCallback((value: string | null | undefined, cycleNumber?: number | null) => {
        if (!value) return cycleNumber ? `Cycle #${cycleNumber}` : 'Current Cycle';
        const match = value.match(/^(\d{4})-(\d{2})$/);
        if (!match) return value;
        const [, year, month] = match;
        const parsed = new Date(Number(year), Number(month) - 1, 1);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, []);

    const formatDateTimeLabel = React.useCallback((value: string | null | undefined) => {
        if (!value) return null;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }, []);

    const fetchCurrentDraw = React.useCallback(async () => {
        if (isPriority) return;
        try {
            const [draw, paymentStatus] = await Promise.all([
                drawService.getCurrentDraw(),
                paymentService.getCurrentMonthStatus().catch(() => null),
            ]);
            setCurrentDraw(draw);
            if (paymentStatus) {
                setHasPaidCurrentCycle(Boolean(paymentStatus.has_paid));
            }
        } catch (error) {
            console.error('[HomeScreen] fetchCurrentDraw failed', error);
        } finally {
            setLastSyncedAt(new Date().toISOString());
        }
    }, [isPriority]);

    const fetchRecentWinners = React.useCallback(async () => {
        if (isPriority) {
            setRecentWinners([]);
            return;
        }
        try {
            const history = await distributionService.getDistributionHistory();
            const parseCycleRank = (cycleId: string) => {
                const match = String(cycleId || '').match(/^cyc_(\d{4})_(\d{1,2})$/i);
                if (!match) return Number.NEGATIVE_INFINITY;
                const year = Number(match[1]);
                const number = Number(match[2]);
                if (Number.isNaN(year) || Number.isNaN(number)) return Number.NEGATIVE_INFINITY;
                return year * 100 + number;
            };

            const completedCycles = history.items
                .filter((item) => item.status === 'completed')
                .sort((a, b) => parseCycleRank(b.cycle_id) - parseCycleRank(a.cycle_id))
                .slice(0, 6);

            if (completedCycles.length === 0) {
                setRecentWinners([]);
                return;
            }

            const cyclesWithWinners = completedCycles.filter((cycle) => (cycle.beneficiaries_count ?? 0) > 0);
            if (cyclesWithWinners.length === 0) {
                setRecentWinners([]);
                return;
            }

            for (const cycle of cyclesWithWinners) {
                const details = await distributionService.getDistributionDetail(cycle.cycle_id);
                const winners = (details.beneficiaries ?? []).map((beneficiary) => ({
                    ...beneficiary,
                    won_at: beneficiary.selected_at,
                }));
                if (winners.length > 0) {
                    setRecentWinners(winners);
                    return;
                }
            }

            setRecentWinners([]);
        } catch (error) {
            console.error('[HomeScreen] fetchRecentWinners failed', error);
            setRecentWinners([]);
        }
    }, [isPriority]);

    const fetchHomeData = React.useCallback(async () => {
        if (isPriority) return;
        await Promise.allSettled([fetchCurrentDraw(), fetchRecentWinners()]);
    }, [fetchCurrentDraw, fetchRecentWinners, isPriority]);

    const handleSimulateThresholdMet = React.useCallback(async () => {
        if (isPriority) return;
        const cycleId = currentDraw?.draw_id;
        if (!cycleId) return;
        try {
            const simulation = await thresholdGameService.simulateGameFlow(cycleId, {
                pending_seconds: 5,
                open_seconds: 90,
                auto_create_game: true,
                auto_publish_game: true,
                auto_close_game: true,
                auto_rollover: true,
            });
            await fetchCurrentDraw();
            // burst polling to quickly catch pending->open transition after simulation kickoff
            setTimeout(() => void fetchCurrentDraw(), 2500);
            setTimeout(() => void fetchCurrentDraw(), 5500);
            setTimeout(() => void fetchCurrentDraw(), 9000);
            void simulation;
        } catch (error: any) {
            const message = String(error?.message || '');
            const lower = message.toLowerCase();
            if (lower.includes('not eligible')) {
                setStatusModal({
                    visible: true,
                    title: 'Not Eligible',
                    message,
                    variant: 'info',
                });
                return;
            }
            if (lower.includes('not enabled')) {
                setStatusModal({
                    visible: true,
                    title: 'Simulation Disabled',
                    message: 'Simulation API is disabled on this backend environment.',
                    variant: 'info',
                });
                return;
            }
            if (lower.includes('not allowed')) {
                setStatusModal({
                    visible: true,
                    title: 'Simulation Permission',
                    message: 'Your account is not allowed to run simulation endpoints.',
                    variant: 'info',
                });
                return;
            }
            console.error('[HomeScreen] simulateThresholdMet failed', error);
            setStatusModal({
                visible: true,
                title: 'Update Failed',
                message: message || 'Could not update threshold status.',
                variant: 'error',
            });
        }
    }, [
        currentDraw?.distribution_state,
        currentDraw?.draw_id,
        currentDraw?.status,
        currentDraw?.target_pool,
        currentDraw?.total_pool,
        fetchCurrentDraw,
        isPriority,
    ]);

    const handlePlayGamePress = React.useCallback(async () => {
        if (isPriority) return;
        if (isCheckingEligibility) return;
        setIsCheckingEligibility(true);
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
            if (!isPaidForGame) {
                setStatusModal({
                    visible: true,
                    title: 'Not Eligible',
                    message:
                        'You are not eligible to play this cycle because payment has not been completed for this cycle.',
                    variant: 'info',
                });
                return;
            }

            const state = cycle.distribution_state;
            if (state === 'threshold_met_game_pending' || state === 'threshold_met_game_open') {
                router.push('/draws/threshold-game' as any);
                return;
            }
            if (state !== 'threshold_met_game_open') {
                setStatusModal({
                    visible: true,
                    title: 'Game Not Open',
                    message:
                        state === 'threshold_met_game_closed' || state === 'distribution_processing'
                            ? 'Game window is closed for this cycle.'
                            : 'The threshold game is not open for this cycle yet.',
                    variant: 'info',
                });
                return;
            }

            if (!cycle.game.exists || !cycle.game.game_id) {
                setStatusModal({
                    visible: true,
                    title: 'Game Unavailable',
                    message: 'No active threshold game is available right now.',
                    variant: 'info',
                });
                return;
            }

            try {
                await thresholdGameService.getMySubmission(cycle.game.game_id);
                router.push('/draws/threshold-game' as any);
            } catch (error: unknown) {
                const apiError = error as ThresholdGameApiError;
                const message = String(apiError?.message || '');
                if (apiError?.status === 403 || message.toLowerCase().includes('not eligible')) {
                    setStatusModal({
                        visible: true,
                        title: 'Not Eligible',
                        message:
                            'You are not eligible to play this cycle because payment has not been completed for this cycle.',
                        variant: 'info',
                    });
                    return;
                }
                setStatusModal({
                    visible: true,
                    title: 'Could Not Open Game',
                    message: message || 'Could not verify game eligibility right now.',
                    variant: 'error',
                });
            }
        } finally {
            setIsCheckingEligibility(false);
        }
    }, [currentDraw?.draw_id, isCheckingEligibility, isPriority, router]);

    const quickActionsWithHandlers = React.useMemo(
        () =>
            homeQuickActions.map((action) => ({
                ...action,
                onPress: () => {
                    if (action.route) {
                        router.push(action.route as any);
                    } else if (action.action === 'share') {
                        // TODO: Open share modal
                    } else if (action.action === 'referral') {
                        // TODO: Show referral code
                    } else if (action.action === 'how_it_works') {
                        // TODO: Navigate to how it works
                    }
                },
            })),
        [router]
    );

    React.useEffect(() => {
        if (isPriority) return;
        void fetchHomeData();
    }, [fetchHomeData, isPriority]);

    useFocusEffect(
        React.useCallback(() => {
            if (isPriority) return () => {};
            void fetchHomeData();
            const poller = setInterval(() => {
                void fetchCurrentDraw();
            }, 15000);
            return () => clearInterval(poller);
        }, [fetchCurrentDraw, fetchHomeData, isPriority])
    );

    const onRefresh = React.useCallback(async () => {
        if (isPriority) return;
        setRefreshing(true);
        try {
            await fetchHomeData();
        } finally {
            setRefreshing(false);
        }
    }, [fetchHomeData, isPriority]);

    const lastUpdatedLabel = React.useMemo(
        () => formatDateTimeLabel(lastSyncedAt),
        [formatDateTimeLabel, lastSyncedAt]
    );

    const totalPool = currentDraw?.total_pool ?? 0;
    const participantsCount = currentDraw?.participants_count ?? 0;
    const winnersCount = currentDraw?.number_of_winners ?? 0;
    const prizePerWinner = currentDraw
        ? winnersCount > 0
            ? currentDraw.target_pool / winnersCount
            : currentDraw.prize_per_winner
        : 0;
    const cycleCloseLabel = currentDraw
        ? currentDraw.closes_when_target_reached
            ? `At ${currencyFormatter.format(currentDraw.target_pool)} target`
            : formatDateLabel(currentDraw.registration_closes_at)
        : 'Loading...';

    if (isPriority) {
        return <Redirect href="/(tabs)/priority-home" />;
    }

    return (
        <Screen className='pt-2'>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                        title="Refreshing latest draw stats"
                    />
                }
            >
                <View className="mb-2 mt-1 flex-row items-center justify-between px-1">
                    <AppText
                        className="text-xs"
                        style={{ color: colors.textSecondary }}
                        accessibilityLiveRegion="polite"
                    >
                        {lastUpdatedLabel ? `Last updated: ${lastUpdatedLabel}` : 'Checking latest draw stats...'}
                    </AppText>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Refresh home dashboard stats"
                        onPress={onRefresh}
                        disabled={refreshing}
                    >
                        <AppText
                            className="text-xs font-semibold"
                            style={{ color: refreshing ? colors.textSecondary : colors.primary }}
                        >
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </AppText>
                    </Pressable>
                </View>

                <MembershipProgressCard
                    drawId={currentDraw?.draw_id ?? '---'}
                    monthLabel={formatPeriodLabel(currentDraw?.month, currentDraw?.cycle_number)}
                    status={currentDraw?.status ?? 'pending'}
                    payoutStatus={currentDraw?.payout_status ?? 'pending'}
                    lotteryType={currentDraw?.lottery_type ?? 'monthly'}
                    isParticipating={
                        hasPaidCurrentCycle !== null
                            ? hasPaidCurrentCycle
                            : Boolean(currentDraw?.user_participation?.is_participating)
                    }
                    progressPercentage={currentDraw?.progress_percentage ?? 0}
                    remainingToTargetLabel={currencyFormatter.format(currentDraw?.remaining_to_target ?? 0)}
                />

                <QuickStatsGrid
                    totalPool={currencyFormatter.format(totalPool)}
                    participantsCount={participantsCount}
                    prizePerWinner={currencyFormatter.format(prizePerWinner)}
                    numberOfWinners={winnersCount}
                    cycleCloseLabel={cycleCloseLabel}
                />

                <NextDrawCountdown
                    currentPool={totalPool}
                    threshold={currentDraw?.target_pool ?? APP_CONFIG.DISTRIBUTION_THRESHOLD}
                    beneficiariesCount={winnersCount || APP_CONFIG.WINNERS_PER_DRAW}
                    distributionState={currentDraw?.distribution_state ?? currentDraw?.status}
                    onSimulateThreshold={handleSimulateThresholdMet}
                    onPlayGame={handlePlayGamePress}
                />

                <RecentWinnersCarousel winners={recentWinners} />

                <QuickActionsGrid actions={quickActionsWithHandlers} />
            </ScrollView>
            <StatusModal
                visible={statusModal.visible}
                title={statusModal.title}
                message={statusModal.message}
                variant={statusModal.variant}
                onClose={() => setStatusModal((prev) => ({ ...prev, visible: false }))}
            />
        </Screen>
    );
}
