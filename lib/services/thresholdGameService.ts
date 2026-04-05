import client from '@/lib/client';
import {
    DistributionCycleCurrentResponse,
    DistributionGameActiveResponse,
    DistributionGameSubmissionState,
    SubmitDistributionGameAnswerPayload,
    SubmitDistributionGameAnswerResponse,
} from '@/types/threshold-game.types';

type Envelope<T> = {
    success?: boolean;
    data?: T;
};

export type ThresholdGameApiError = Error & {
    status?: number;
    data?: unknown;
};

const unwrap = <T>(payload: T | Envelope<T>): T => {
    if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
        const data = (payload as Envelope<T>).data;
        if (data !== undefined) return data;
    }
    return payload as T;
};

const extractFirstErrorText = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = extractFirstErrorText(item);
            if (found) return found;
        }
        return null;
    }
    if (value && typeof value === 'object') {
        for (const nested of Object.values(value as Record<string, unknown>)) {
            const found = extractFirstErrorText(nested);
            if (found) return found;
        }
    }
    return null;
};

const toApiErrorMessage = (error: any): string => {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const requestUrl = String(error?.config?.url || '');
    const errorCode = String(data?.error?.code || '').trim().toUpperCase();
    const detail =
        extractFirstErrorText(data?.error?.details?.error?.details) ||
        extractFirstErrorText(data?.error?.details?.error?.message) ||
        extractFirstErrorText(data?.error?.details?.message) ||
        extractFirstErrorText(data?.error?.details) ||
        extractFirstErrorText(data?.error?.message) ||
        extractFirstErrorText(data?.detail) ||
        extractFirstErrorText(data?.message) ||
        extractFirstErrorText(data?.error) ||
        error?.message ||
        'Request failed.';

    if (status === 409) return 'You already submitted an answer for this game.';
    if (status === 422) return 'Game is not open for submissions.';
    if (errorCode === 'SIMULATION_NOT_ENABLED') {
        return 'Simulation is not enabled in this backend environment.';
    }
    if (errorCode === 'SIMULATION_NOT_ALLOWED') return 'Simulation is currently unavailable for this account.';
    if (errorCode === 'CYCLE_NOT_FOUND') {
        return 'Cycle not found. Refresh and try again.';
    }
    if (errorCode === 'GAME_CREATION_FAILED') {
        return 'Simulation could not create a game. Please retry.';
    }
    if (errorCode === 'INVALID_SIMULATION_STATE') {
        return 'Simulation cannot run from the current cycle state yet.';
    }
    if (status === 403 && requestUrl.includes('/admin/testing/cycles/')) {
        return 'Simulation request was blocked by backend permissions.';
    }
    if (status === 404 && requestUrl.includes('/admin/testing/cycles/')) {
        return 'Simulation endpoint not found on backend (404). Check ENABLE_SIMULATION_API and route deployment.';
    }
    if (status === 403) {
        return 'You are not eligible for this cycle. You need a qualifying contribution/payment in this cycle before you can play the threshold game.';
    }
    if (status === 404) return 'No active threshold game found right now.';
    if (status === 400) return typeof detail === 'string' ? detail : 'Invalid answer payload.';
    return typeof detail === 'string' ? detail : 'Request failed.';
};

const toApiError = (error: any): ThresholdGameApiError => {
    const apiError = new Error(toApiErrorMessage(error)) as ThresholdGameApiError;
    apiError.status = error?.response?.status;
    apiError.data = error?.response?.data;
    return apiError;
};

const postCycleSimulationWithFallback = async (
    cycleId: string,
    suffix: 'simulate-threshold-met' | 'simulate-game-close' | 'simulate-rollover'
): Promise<DistributionCycleCurrentResponse> => {
    const candidatePaths = buildSimulationCandidatePaths(cycleId, suffix);

    let lastError: any = null;
    for (const path of candidatePaths) {
        try {
            const response = await client.post<
                Envelope<DistributionCycleCurrentResponse> | DistributionCycleCurrentResponse
            >(path, undefined);
            return unwrap(response.data);
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) {
                lastError = error;
                continue;
            }
            throw toApiError(error);
        }
    }

    throw toApiError(lastError);
};

type SimulateGameFlowPayload = {
    pending_seconds?: number;
    open_seconds?: number;
    auto_create_game?: boolean;
    auto_publish_game?: boolean;
    auto_close_game?: boolean;
    auto_rollover?: boolean;
};

const buildSimulationCandidatePaths = (
    cycleId: string,
    suffix: 'simulate-threshold-met' | 'simulate-game-close' | 'simulate-rollover' | 'simulate-game-flow'
) => {
    const encodedId = encodeURIComponent(cycleId);
    return [`/admin/testing/cycles/${encodedId}/${suffix}/`];
};

const postSimulateGameFlow = async (
    cycleId: string,
    payload: SimulateGameFlowPayload
): Promise<DistributionCycleCurrentResponse> => {
    const candidatePaths = buildSimulationCandidatePaths(cycleId, 'simulate-game-flow');

    let lastError: any = null;
    for (const path of candidatePaths) {
        try {
            const response = await client.post<
                Envelope<{
                    cycle_id?: string;
                }> | {
                    cycle_id?: string;
                }
            >(path, payload);

            const data = unwrap(response.data);
            const hintedCycleId = String((data as any)?.cycle_id || cycleId);
            return await thresholdGameService.getCurrentCycleByIdHint(hintedCycleId);
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) {
                lastError = error;
                continue;
            }
            throw toApiError(error);
        }
    }

    throw toApiError(lastError);
};

export const thresholdGameService = {
    async getCurrentCycleByIdHint(_cycleIdHint?: string): Promise<DistributionCycleCurrentResponse> {
        return this.getCurrentCycle();
    },

    async getCurrentCycle(): Promise<DistributionCycleCurrentResponse> {
        try {
            const response = await client.get<Envelope<DistributionCycleCurrentResponse> | DistributionCycleCurrentResponse>(
                '/cycles/current/'
            );
            return unwrap(response.data);
        } catch (error: any) {
            if (error?.response?.status !== 404) {
                throw toApiError(error);
            }
            try {
                const fallback = await client.get<Envelope<DistributionCycleCurrentResponse> | DistributionCycleCurrentResponse>(
                    '/distribution/cycle/current/'
                );
                return unwrap(fallback.data);
            } catch (fallbackError: any) {
                throw toApiError(fallbackError);
            }
        }
    },

    async getActiveGame(cycleId?: string): Promise<DistributionGameActiveResponse> {
        try {
            const query = cycleId ? `?cycle_id=${encodeURIComponent(cycleId)}` : '';
            const response = await client.get<Envelope<DistributionGameActiveResponse> | DistributionGameActiveResponse>(
                `/distribution-games/active/${query}`
            );
            return unwrap(response.data);
        } catch (error: any) {
            throw toApiError(error);
        }
    },

    async submitAnswer(
        gameId: string,
        payload: SubmitDistributionGameAnswerPayload
    ): Promise<SubmitDistributionGameAnswerResponse> {
        try {
            const response = await client.post<
                Envelope<SubmitDistributionGameAnswerResponse> | SubmitDistributionGameAnswerResponse
            >(`/distribution-games/${gameId}/submissions/`, payload);
            return unwrap(response.data);
        } catch (error: any) {
            throw toApiError(error);
        }
    },

    async getMySubmission(gameId: string): Promise<DistributionGameSubmissionState> {
        try {
            const response = await client.get<
                Envelope<DistributionGameSubmissionState> | DistributionGameSubmissionState
            >(`/distribution-games/${gameId}/my-submission/`);
            return unwrap(response.data);
        } catch (error: any) {
            throw toApiError(error);
        }
    },

    async simulateThresholdMet(cycleId: string): Promise<DistributionCycleCurrentResponse> {
        return postCycleSimulationWithFallback(cycleId, 'simulate-threshold-met');
    },

    async simulateGameClose(cycleId: string): Promise<DistributionCycleCurrentResponse> {
        return postCycleSimulationWithFallback(cycleId, 'simulate-game-close');
    },

    async simulateRollover(cycleId: string): Promise<DistributionCycleCurrentResponse> {
        return postCycleSimulationWithFallback(cycleId, 'simulate-rollover');
    },

    async simulateGameFlow(
        cycleId: string,
        payload: SimulateGameFlowPayload = {}
    ): Promise<DistributionCycleCurrentResponse> {
        const normalizedPayload: SimulateGameFlowPayload = {
            pending_seconds: payload.pending_seconds ?? 5,
            open_seconds: payload.open_seconds ?? 90,
            auto_create_game: payload.auto_create_game ?? true,
            auto_publish_game: payload.auto_publish_game ?? true,
            auto_close_game: payload.auto_close_game ?? true,
            // Production guide requires this to remain enabled.
            auto_rollover: true,
        };

        try {
            return await postSimulateGameFlow(cycleId, normalizedPayload);
        } catch (error: any) {
            const status = error?.status ?? error?.response?.status;
            if (status === 404) {
                return await this.simulateThresholdMet(cycleId);
            }
            throw error;
        }
    },
};
