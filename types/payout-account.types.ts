export type PayoutVerificationStatus = 'unverified' | 'verified' | 'manual_review' | 'failed' | string;

export interface PayoutAccount {
    id: number | string;
    bank_name?: string | null;
    bank_code?: string | null;
    account_name?: string | null;
    account_number?: string | null;
    account_number_masked?: string | null;
    country?: string | null;
    country_code?: string | null;
    currency?: string | null;
    is_default?: boolean;
    verification_status?: PayoutVerificationStatus | null;
    created_at?: string | null;
}

