import { DistributionCycleCurrentResponse, DistributionGameActiveResponse } from '@/types/threshold-game.types';

export const mockDistributionCycleCurrent: DistributionCycleCurrentResponse = {
    cycle_id: 'cyc_2026_02',
    period_label: 'February 2026',
    threshold_amount: 1000000,
    total_pool: 1000000,
    total_participants: 50271,
    distribution_state: 'threshold_met_game_open',
    game: {
        exists: true,
        game_id: 'game_01JABCXYZ',
        status: 'open',
        starts_at: '2026-02-16T12:00:00Z',
        ends_at: '2026-02-18T12:00:00Z',
        has_user_submitted: false,
    },
};

export const mockActiveDistributionGame: Omit<DistributionGameActiveResponse, 'submission'> = {
    game_id: 'game_01JABCXYZ',
    cycle_id: 'cyc_2026_02',
    title: 'Guess The Ball Position',
    question: 'Two players are heading. Where is the ball?',
    image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
    status: 'open',
    starts_at: '2026-02-16T12:00:00Z',
    ends_at: '2026-02-18T12:00:00Z',
    accepted_coordinate_available: false,
};
