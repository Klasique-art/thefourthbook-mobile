export interface CurrentUser {
    user_id: string;
    email: string;
    phone: string;
    first_name: string;
    last_name: string;
    country: string;
    date_of_birth: string; // ISO date string
    kyc_status: 'verified' | 'pending' | 'rejected' | 'unverified' | 'not_submitted';
    kyc_verified_at: string | null; // ISO datetime string
    email_verified: boolean;
    phone_verified: boolean;
    account_status: 'active' | 'suspended' | 'inactive';
    created_at: string; // ISO datetime string
    updated_at: string; // ISO datetime string
    referral_code: string | null;
    referred_by: string | null;
    user_type?: 'normal' | 'priority';
}
