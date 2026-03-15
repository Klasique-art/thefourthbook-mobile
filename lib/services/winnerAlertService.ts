import client from '@/lib/client';
import { WinnerLatestAlertsResponse } from '@/types/winner-alert.types';

type Envelope<T> = {
    success?: boolean;
    message?: string;
    data?: T;
};

type AcknowledgeResponse = {
    alert_id: string;
    acknowledged_at: string;
};

const unwrap = <T>(payload: T | Envelope<T>): T => {
    if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
        const data = (payload as Envelope<T>).data;
        if (data !== undefined) return data;
    }
    return payload as T;
};

export const winnerAlertService = {
    async getLatest(): Promise<WinnerLatestAlertsResponse> {
        const response = await client.get<Envelope<WinnerLatestAlertsResponse> | WinnerLatestAlertsResponse>(
            '/alerts/winner-latest/'
        );
        const data = unwrap(response.data);
        return {
            latest_alert: data.latest_alert ?? null,
            alerts: data.alerts ?? [],
            unread_count: Number(data.unread_count ?? 0),
        };
    },

    async acknowledge(alertId: string): Promise<AcknowledgeResponse> {
        const response = await client.post<Envelope<AcknowledgeResponse> | AcknowledgeResponse>(
            `/alerts/${encodeURIComponent(alertId)}/acknowledge/`
        );
        return unwrap(response.data);
    },
};

