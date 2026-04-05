import axios, { AxiosRequestConfig } from 'axios';

import { API_BASE_URL } from '@/config/settings';
import { isLikelyUnreachableApiError, markApiAvailable, markApiUnavailable } from '@/lib/apiHealth';
import { authStorage } from '@/lib/auth';
import { authEvents } from '@/lib/authEvents';

function decodeJwtPayload(token: string): { exp?: number } | null {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

function isTokenExpiredOrExpiring(token: string, bufferSeconds = 120): boolean {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return false;
    return Math.floor(Date.now() / 1000) >= payload.exp - bufferSeconds;
}

let refreshPromise: Promise<string> | null = null;

const getRefreshedAccessToken = async (): Promise<string> => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            const refreshToken = await authStorage.getRefreshToken();
            if (!refreshToken) throw new Error('No refresh token found.');

            let response;
            try {
                response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
                    refresh: refreshToken,
                });
            } catch (error: any) {
                if (error?.response?.status && error.response.status !== 404) {
                    throw error;
                }
                response = await axios.post(`${API_BASE_URL}/auth/jwt/refresh/`, {
                    refresh: refreshToken,
                });
            }

            const access = (
                response.data?.tokens?.access ??
                response.data?.access ??
                response.data?.data?.tokens?.access ??
                response.data?.data?.access
            ) as string | undefined;
            const refresh = (
                response.data?.tokens?.refresh ??
                response.data?.refresh ??
                response.data?.data?.tokens?.refresh ??
                response.data?.data?.refresh
            ) as string | undefined;
            if (!access) throw new Error('Refresh response missing access token.');

            if (refresh) {
                await authStorage.setTokens(access, refresh);
            } else {
                await authStorage.setAccessToken(access);
            }
            return access;
        } catch (error) {
            throw error;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

const client = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

client.interceptors.request.use(async (config) => {
    try {
        const storedToken = await authStorage.getAccessToken();
        let token = storedToken;

        if (token && isTokenExpiredOrExpiring(token)) {
            try {
                token = await getRefreshedAccessToken();
            } catch (error: any) {
                const status = error?.response?.status;
                if (status === 401 || status === 403) {
                    await authStorage.clearTokens();
                    authEvents.emitUnauthorized();
                    token = null;
                } else {
                    // Network/server refresh failures should not drop an existing valid session.
                    token = storedToken;
                }
            }
        }

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            await authStorage.clearTokens();
            authEvents.emitUnauthorized();
        }
    }
    return config;
});

client.interceptors.response.use(
    (response) => {
        markApiAvailable();
        return response;
    },
    async (error) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest?._retry) {
            originalRequest._retry = true;

            try {
                const newAccessToken = await getRefreshedAccessToken();
                originalRequest.headers = {
                    ...originalRequest.headers,
                    Authorization: `Bearer ${newAccessToken}`,
                };
                return client(originalRequest);
            } catch (refreshError: any) {
                const status = refreshError?.response?.status;
                if (status === 401 || status === 403) {
                    await authStorage.clearTokens();
                    authEvents.emitUnauthorized();
                }
            }
        }

        if (isLikelyUnreachableApiError(error)) {
            markApiUnavailable(error);
        }

        return Promise.reject(error);
    }
);

export default client;
