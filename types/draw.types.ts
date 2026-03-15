export interface CurrentDraw {
    id: string;
    draw_id: string;
    month: string | null;
    cycle_number?: number | null;
    status: string;
    payout_status: string;
    lottery_type: string;
    total_pool: number;
    target_pool: number;
    remaining_to_target: number;
    progress_percentage: number;
    closes_when_target_reached: boolean;
    currency: string;
    prize_per_winner: number;
    number_of_winners: number;
    draw_date: string | null;
    registration_closes_at: string | null;
    participants_count: number;
    distribution_state?: string;
    server_time?: string;
    state_updated_at?: string | null;
    expected_next_transition_at?: string | null;
    rollover_in_progress?: boolean;
    next_cycle_id?: string | null;
    next_cycle_month?: string | null;
    next_cycle_starts_at?: string | null;
    user_participation: {
        is_participating: boolean;
    };
}
