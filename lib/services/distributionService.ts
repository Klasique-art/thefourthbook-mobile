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
    if (status === 'active' || status === 'completed' || status === 'processing') {
        return status;
    }
    return 'processing';
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
                    month: string;
                    total_pool: string;
                    currency: string;
                    prize_per_winner: string;
                    participants_count: number;
                    status: 'active' | 'completed' | 'processing';
                }[];
                total_count: number;
            };
        }>('/public/draws/stats/');

        return {
            items: (response.data.data.draws ?? []).map((draw) => ({
                cycle_id: draw.draw_id,
                period: monthToPeriod(draw.month, draw.draw_id ? `Cycle ${draw.draw_id}` : undefined),
                status: draw.status,
                total_pool: Number(draw.total_pool),
                total_participants: draw.participants_count,
                beneficiaries_count: Number(draw.prize_per_winner) > 0 ? Math.round(Number(draw.total_pool) / Number(draw.prize_per_winner)) : 0,
                distribution_date: draw.month ? `${draw.month}-01T00:00:00Z` : new Date(0).toISOString(),
            })),
        };
    },

    async getDistributionDetail(cycleId: string): Promise<DistributionDetailResponse> {
        const response = await client.get<{
            success: boolean;
            data: {
                id: string;
                draw_id: string;
                month: string;
                status: 'active' | 'completed' | 'processing';
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
        }>(`/public/draws/stats/${cycleId}/`);

        const draw = response.data.data;
        return {
            draw_internal_id: draw.id,
            cycle: {
                cycle_id: draw.draw_id,
                period: monthToPeriod(draw.month, draw.draw_id ? `Cycle ${draw.draw_id}` : undefined),
                status: draw.status,
                total_pool: Number(draw.total_pool),
                total_participants: draw.participants_count,
                beneficiaries_count: draw.beneficiaries_count,
                distribution_date: draw.draw_date,
            },
            beneficiaries: (draw.beneficiaries ?? []).map((beneficiary) => ({
                winner_id: beneficiary.beneficiary_id,
                user_identifier: beneficiary.user_id,
                prize_amount: Number(beneficiary.prize_amount),
                payout_status: beneficiary.payout_status === 'paid' ? 'completed' : beneficiary.payout_status,
                cycle_id: draw.draw_id,
                selected_at: draw.draw_date,
            })),
        };
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
