export type WinnerAlertType = 'winner_selected' | 'payout_sent' | 'payout_failed';

export type WinnerAlertPayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WinnerAlertItem {
    alert_id: string;
    type: WinnerAlertType;
    cycle_id: string;
    cycle_number: number | null;
    selected_at: string | null;
    prize_amount: string;
    currency: string;
    payout_status: WinnerAlertPayoutStatus;
    payout_reference: string | null;
    headline: string;
    message: string;
    requires_ack: boolean;
}

export interface WinnerLatestAlertsResponse {
    latest_alert: WinnerAlertItem | null;
    alerts: WinnerAlertItem[];
    unread_count: number;
}

