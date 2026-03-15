import client from '@/lib/client';
import {
    DistributionDetailResponse,
    DistributionHistoryResponse,
    MySelectionStatusResponse,
    PublicStatisticsResponse,
} from '@/types/distribution.types';

const monthToPeriod = (month: string | null | undefined, fallbackLabel?: string) => {
    if (!month) return fallbackLabel ?? 'Unknown cycle';
    const [year, monthNum] = month.split('-');
    const date = new Date(Number(year), Number(monthNum) - 1, 1);
    if (Number.isNaN(date.getTime())) return fallbackLabel ?? month;
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const normalizeDrawStatus = (status: string): 'active' | 'completed' | 'processing' => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active' || normalized === 'open' || normalized === 'collecting') return 'active';
    if (normalized === 'completed' || normalized === 'distribution_completed') return 'completed';
    if (normalized === 'processing' || normalized === 'distribution_processing') return 'processing';
    return 'processing';
};

const parseSequentialCycleNumber = (cycleId: string): number | null => {
    const match = String(cycleId || '').match(/^cyc_(\d{6,})$/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isNaN(parsed) ? null : parsed;
};

const cycleFallbackRank = (cycleId: string) => {
    const sequential = parseSequentialCycleNumber(cycleId);
    if (sequential !== null) return sequential;

    const normalized = String(cycleId || '');
    const ymMatch = normalized.match(/^cyc_(\d{4})_(\d{1,2})$/i);
    if (ymMatch) {
        const year = Number(ymMatch[1]);
        const month = Number(ymMatch[2]);
        if (!Number.isNaN(year) && !Number.isNaN(month)) return year * 100 + month;
    }

    return Number.NEGATIVE_INFINITY;
};

export const distributionService = {
    async getPublicStatistics(): Promise<PublicStatisticsResponse> {
        const response = await client.get<{
            success: boolean;
            data: PublicStatisticsResponse;
        }>('/public/statistics/');
        return response.data.data;
    },

    async getDistributionHistory(): Promise<DistributionHistoryResponse> {
        const response = await client.get<{
            success: boolean;
            data: {
                draws: {
                    draw_id: string;
                    month: string | null;
                    total_pool: string;
                    currency: string;
                    prize_per_winner: string;
                    participants_count: number;
                    beneficiaries_count?: number;
                    status: string;
                    draw_date?: string | null;
                    distribution_date?: string | null;
                    completed_at?: string | null;
                    updated_at?: string | null;
                }[];
                total_count: number;
            };
        }>('/public/draws/stats/');

        const items = (response.data.data.draws ?? []).map((draw) => ({
            cycle_id: draw.draw_id,
            period: monthToPeriod(draw.month, draw.draw_id ? `Cycle ${draw.draw_id}` : undefined),
            status: normalizeDrawStatus(draw.status),
            total_pool: Number(draw.total_pool),
            total_participants: draw.participants_count,
            beneficiaries_count: typeof draw.beneficiaries_count === 'number' ? draw.beneficiaries_count : 0,
            distribution_date:
                draw.draw_date ??
                draw.distribution_date ??
                draw.completed_at ??
                draw.updated_at ??
                '',
        }));

        const hasStandardSequentialIds = items.some((item) => parseSequentialCycleNumber(item.cycle_id) !== null);
        const filteredItems = hasStandardSequentialIds
            ? items.filter((item) => parseSequentialCycleNumber(item.cycle_id) !== null)
            : items;

        filteredItems.sort((a, b) => {
            const rankDiff = cycleFallbackRank(b.cycle_id) - cycleFallbackRank(a.cycle_id);
            if (rankDiff !== 0) return rankDiff;

            const aDateMs = a.distribution_date ? new Date(a.distribution_date).getTime() : NaN;
            const bDateMs = b.distribution_date ? new Date(b.distribution_date).getTime() : NaN;
            if (!Number.isNaN(aDateMs) && !Number.isNaN(bDateMs) && aDateMs !== bDateMs) return bDateMs - aDateMs;

            return String(b.cycle_id).localeCompare(String(a.cycle_id));
        });

        return {
            items: filteredItems,
        };
    },

    async getDistributionDetail(cycleId: string): Promise<DistributionDetailResponse> {
        const publicDetailPath = `/public/draws/stats/${cycleId}/`;
        const response = await client.get<{
            success: boolean;
            data: {
                id: string;
                draw_id: string;
                month: string | null;
                status: string;
                payout_status: string;
                total_pool: string;
                currency: string;
                prize_per_winner: string;
                number_of_winners: number;
                draw_date: string;
                participants_count: number;
                beneficiaries_count: number;
                beneficiaries: {
                    beneficiary_id: string;
                    user_id: string;
                    prize_amount: string;
                    payout_status: 'pending' | 'processing' | 'completed' | 'failed' | 'paid';
                    payout_reference: string | null;
                }[];
            };
        }>(publicDetailPath);

        const mapDrawDetail = (payload: any): DistributionDetailResponse => {
            const source = payload?.data ?? payload ?? {};
            const drawId = source.draw_id ?? source.cycle_id ?? cycleId;
            const rawBeneficiaries = Array.isArray(source.beneficiaries) ? source.beneficiaries : [];

            const beneficiaries = rawBeneficiaries
                .filter((beneficiary: any) => beneficiary?.is_winner !== false)
                .map((beneficiary: any, idx: number) => {
                    const rawStatus = String(beneficiary?.payout_status ?? 'pending').toLowerCase();
                    const normalizedStatus =
                        rawStatus === 'paid' ? 'completed' : (rawStatus as 'pending' | 'processing' | 'completed' | 'failed');
                    return {
                        winner_id:
                            beneficiary?.beneficiary_id ??
                            beneficiary?.winner_id ??
                            beneficiary?.id ??
                            `${drawId}_winner_${idx}`,
                        user_identifier:
                            beneficiary?.user_id ??
                            beneficiary?.user_identifier ??
                            beneficiary?.account_id ??
                            'unknown_user',
                        prize_amount: Number(beneficiary?.prize_amount ?? source?.prize_per_winner ?? 0),
                        payout_status: normalizedStatus,
                        cycle_id: drawId,
                        selected_at:
                            beneficiary?.selected_at ??
                            source?.draw_date ??
                            source?.completed_at ??
                            source?.updated_at ??
                            new Date(0).toISOString(),
                    };
                });

            return {
                draw_internal_id: source.id ?? source.draw_internal_id ?? drawId,
                cycle: {
                    cycle_id: drawId,
                    period: monthToPeriod(source.month, drawId ? `Cycle ${drawId}` : undefined),
                    status: normalizeDrawStatus(source.status ?? source.distribution_state ?? 'processing'),
                    total_pool: Number(source.total_pool ?? 0),
                    total_participants: Number(source.participants_count ?? source.total_participants ?? 0),
                    beneficiaries_count:
                        Number(source.beneficiaries_count ?? source.number_of_winners ?? beneficiaries.length) || 0,
                    distribution_date:
                        source.draw_date ?? source.distribution_date ?? source.completed_at ?? new Date(0).toISOString(),
                },
                beneficiaries,
            };
        };

        const publicDetail = mapDrawDetail(response.data?.data);
        if (publicDetail.beneficiaries.length > 0) return publicDetail;
        if ((publicDetail.cycle.beneficiaries_count ?? 0) <= 0) return publicDetail;

        try {
            const lotteryPath = `/lottery/draws/${encodeURIComponent(String(cycleId))}/`;
            const lotteryResponse = await client.get(lotteryPath);
            const lotteryDetail = mapDrawDetail(lotteryResponse.data?.data ?? lotteryResponse.data);
            return lotteryDetail;
        } catch {
            return publicDetail;
        }
    },

    async getMySelectionStatus(): Promise<MySelectionStatusResponse> {
        const response = await client.get<{
            success: boolean;
            data: {
                selections: {
                    id: string;
                    draw_id: string;
                    draw_month: string;
                    draw_status: string;
                    draw_registration_closes_at: string;
                    payment_reference: string;
                    is_winner: boolean;
                    prize_amount: string;
                    payout_status: 'pending' | 'processing' | 'completed' | 'failed' | 'paid';
                    payout_reference: string | null;
                    created_at: string;
                }[];
                statistics: {
                    times_selected: number;
                    total_won: number;
                    currency: string;
                };
            };
        }>('/draws/my-selection-history/');

        const payload = response.data.data;
        const selections = (payload.selections ?? [])
            .filter((item) => item.is_winner)
            .map((item) => ({
                cycle_id: item.draw_id,
                period: monthToPeriod(item.draw_month, item.draw_id ? `Cycle ${item.draw_id}` : undefined),
                distribution_date: item.draw_registration_closes_at,
                prize_amount: Number(item.prize_amount),
                payout_status: item.payout_status === 'paid' ? 'completed' : item.payout_status,
                selected_at: item.created_at,
                winner_id: item.id,
                draw_status: normalizeDrawStatus(item.draw_status),
            }))
            .sort((a, b) => new Date(b.selected_at).getTime() - new Date(a.selected_at).getTime());

        return {
            user_identifier: 'current_user',
            total_selection_count: payload.statistics?.times_selected ?? selections.length,
            total_won_amount: payload.statistics?.total_won ?? 0,
            currency: payload.statistics?.currency ?? 'USD',
            selections,
        };
    },
};
