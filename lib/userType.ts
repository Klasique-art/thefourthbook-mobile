import { CurrentUser } from '@/types/user.types';

type UnknownRecord = Record<string, unknown>;

const toNormalizedType = (value: unknown): 'normal' | 'priority' | undefined => {
    if (typeof value === 'boolean') return value ? 'priority' : 'normal';
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (['priority', 'high_priority', 'high-priority', 'vip'].includes(normalized)) return 'priority';
    if (['normal', 'regular', 'guest', 'standard'].includes(normalized)) return 'normal';
    return undefined;
};

export const resolveUserType = (user: CurrentUser | UnknownRecord | null | undefined): 'normal' | 'priority' | undefined => {
    if (!user || typeof user !== 'object') return undefined;
    const record = user as UnknownRecord;
    return (
        toNormalizedType(record.user_type) ||
        toNormalizedType(record.userType) ||
        toNormalizedType(record.account_type) ||
        toNormalizedType(record.accountType) ||
        toNormalizedType(record.user_role) ||
        toNormalizedType(record.role) ||
        toNormalizedType(record.is_priority_user)
    );
};

export const isPriorityUser = (user: CurrentUser | UnknownRecord | null | undefined): boolean =>
    resolveUserType(user) === 'priority';

