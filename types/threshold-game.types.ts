export type DistributionState =
    | 'collecting'
    | 'threshold_met_game_pending'
    | 'threshold_met_game_open'
    | 'threshold_met_game_closed'
    | 'distribution_processing'
    | 'distribution_completed';

export type DistributionGameStatus = 'draft' | 'scheduled' | 'open' | 'closed';

export interface DistributionCycleCurrentResponse {
    cycle_id: string;
    cycle_number?: number | null;
    period_label: string | null;
    threshold_amount: number;
    total_pool: number;
    total_participants: number;
    distribution_state: DistributionState;
    server_time?: string;
    state_updated_at?: string | null;
    expected_next_transition_at?: string | null;
    rollover_in_progress?: boolean;
    next_cycle_id?: string | null;
    next_cycle_month?: string | null;
    next_cycle_starts_at?: string | null;
    game: {
        exists: boolean;
        game_id: string | null;
        status: DistributionGameStatus | null;
        starts_at: string | null;
        ends_at: string | null;
        has_user_submitted: boolean;
    };
}

export interface DistributionGameOption {
    option_id: string;
    label: string;
    text: string;
}

export interface DistributionGameSubmissionState {
    has_submitted: boolean;
    selected_option_id: string | null;
    submitted_at: string | null;
    locked: boolean;
}

export interface DistributionGameActiveResponse {
    game_id: string;
    cycle_id: string;
    title: string;
    prompt_text: string;
    image_url: string;
    status: DistributionGameStatus;
    starts_at: string;
    ends_at: string;
    options: DistributionGameOption[];
    submission: DistributionGameSubmissionState;
}

export interface SubmitDistributionGameAnswerPayload {
    selected_option_id: string;
    client_submitted_at: string;
}

export interface SubmitDistributionGameAnswerResponse {
    submission_id: string;
    game_id: string;
    member_id: string;
    selected_option_id: string;
    submitted_at: string;
    locked: boolean;
}
