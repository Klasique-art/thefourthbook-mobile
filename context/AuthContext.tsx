import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { authStorage } from '@/lib/auth';
import { authEvents } from '@/lib/authEvents';
import { authService } from '@/lib/services/authService';
import { LoginCredentials, SignupData } from '@/types/auth.types';
import { CurrentUser } from '@/types/user.types';

interface AuthContextType {
    user: CurrentUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (credentials: LoginCredentials) => Promise<void>;
    loginWithGoogle: (idToken: string) => Promise<void>;
    signup: (data: SignupData) => Promise<void>;
    verifySignupCode: (email: string, code: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasSession, setHasSession] = useState(false);

    const refreshUser = useCallback(async () => {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
    }, []);

    const forceLocalLogout = useCallback(async () => {
        await authStorage.clearTokens();
        setHasSession(false);
        setUser(null);
    }, []);

    const shouldForceLogoutOnAuthFailure = (error: any) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) return true;
        const message = String(error?.message || '').toLowerCase();
        return message.includes('network error') || message.includes('unauthorized') || message.includes('forbidden');
    };

    const checkAuth = useCallback(async () => {
        try {
            const [accessToken, refreshToken] = await Promise.all([
                authStorage.getAccessToken(),
                authStorage.getRefreshToken(),
            ]);

            if (!accessToken && !refreshToken) {
                setHasSession(false);
                setUser(null);
                return;
            }

            setHasSession(true);

            try {
                await refreshUser();
            } catch (error: any) {
                console.error('[AuthContext] checkAuth refreshUser failed', error);
                if (shouldForceLogoutOnAuthFailure(error)) {
                    await forceLocalLogout();
                }
            }
        } catch (error) {
            console.error('[AuthContext] checkAuth failed', error);
            await forceLocalLogout();
        } finally {
            setIsLoading(false);
        }
    }, [forceLocalLogout, refreshUser]);

    useEffect(() => {
        void checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        const unsubscribe = authEvents.onUnauthorized(() => {
            setHasSession(false);
            setUser(null);
        });

        return unsubscribe;
    }, []);

    const login = useCallback(async (credentials: LoginCredentials) => {
        await authService.login(credentials);
        setHasSession(true);

        try {
            await refreshUser();
        } catch (error) {
            console.error('[AuthContext] login refreshUser failed', error);
            await forceLocalLogout();
        }
    }, [forceLocalLogout, refreshUser]);

    const loginWithGoogle = useCallback(async (idToken: string) => {
        await authService.loginWithGoogle(idToken);
        setHasSession(true);

        try {
            await refreshUser();
        } catch (error) {
            console.error('[AuthContext] loginWithGoogle refreshUser failed', error);
            await forceLocalLogout();
        }
    }, [forceLocalLogout, refreshUser]);

    const signup = useCallback(async (data: SignupData) => {
        try {
            await authService.signup(data);
        } catch (error: any) {
            const dataPreview = (() => {
                const raw = error?.response?.data;
                if (typeof raw === 'string') return raw.slice(0, 500);
                try {
                    return (JSON.stringify(raw) ?? '').slice(0, 500);
                } catch {
                    return '';
                }
            })();

            console.log(
                `[AuthContext] signup failed :: ${JSON.stringify({
                    message: error?.message,
                    status: error?.response?.status,
                    data_preview: dataPreview,
                })}`
            );
            throw error;
        }
    }, []);

    const verifySignupCode = useCallback(async (email: string, code: string) => {
        await authService.verifySignupCode({ email, code });

        const pending = await authService.consumePendingSignupCredentials(email);
        if (!pending) throw new Error('Verification failed. Please try again.');

        await login(pending);
    }, [login]);

    const logout = useCallback(async () => {
        await authService.logout();
        setHasSession(false);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: hasSession,
                login,
                loginWithGoogle,
                signup,
                verifySignupCode,
                logout,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
