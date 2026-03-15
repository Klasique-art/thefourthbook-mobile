import client from '@/lib/client';
import { PayoutAccount } from '@/types/payout-account.types';

type ApiEnvelope<T> = {
    success?: boolean;
    message?: string;
    data?: T;
};

type ListPayload = {
    payout_accounts?: PayoutAccount[];
    results?: PayoutAccount[];
};

type PayoutBankRaw = {
    bank_name?: string;
    name?: string;
    bank_code?: string;
    code?: string;
    country_code?: string;
    country?: string;
    source?: string;
};

type PayoutBanksPayload = {
    payout_banks?: PayoutBankRaw[];
    banks?: PayoutBankRaw[];
    results?: PayoutBankRaw[];
    source?: string;
};

const unwrap = <T>(payload: T | ApiEnvelope<T>): T => {
    if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
        const data = (payload as ApiEnvelope<T>).data;
        if (data !== undefined) return data;
    }
    return payload as T;
};

const pickId = (account: PayoutAccount): string | number => account.id;

export type PayoutBank = {
    bank_name: string;
    bank_code: string;
    country_code: string;
    source?: string;
};

const normalizeBank = (bank: PayoutBankRaw): PayoutBank | null => {
    const bankName = String(bank.bank_name ?? bank.name ?? '').trim();
    const bankCode = String(bank.bank_code ?? bank.code ?? '').trim();
    const countryCode = String(bank.country_code ?? bank.country ?? '').trim().toUpperCase();
    if (!bankName || !bankCode) return null;
    return {
        bank_name: bankName,
        bank_code: bankCode,
        country_code: countryCode,
        source: bank.source,
    };
};

const unwrapBanks = (payload: PayoutBanksPayload | ApiEnvelope<PayoutBanksPayload>) => {
    const data = unwrap(payload);
    const rawBanks = data.payout_banks ?? data.banks ?? data.results ?? [];
    const banks = rawBanks.map(normalizeBank).filter((bank): bank is PayoutBank => Boolean(bank));
    return { banks, source: data.source };
};

export const payoutAccountService = {
    async getAccounts(): Promise<PayoutAccount[]> {
        const response = await client.get<ApiEnvelope<ListPayload> | ListPayload>('/payments/payout-accounts/');
        const payload = unwrap(response.data);
        return payload.payout_accounts ?? payload.results ?? [];
    },

    async createAccount(payload: {
        bank_name: string;
        account_number: string;
        bank_code: string;
        country_code: string;
        currency?: string;
        is_default?: boolean;
    }): Promise<PayoutAccount> {
        const response = await client.post<ApiEnvelope<PayoutAccount> | PayoutAccount>('/payments/payout-accounts/', payload);
        return unwrap(response.data);
    },

    async verifyAccount(id: string | number): Promise<PayoutAccount> {
        const response = await client.post<ApiEnvelope<PayoutAccount> | PayoutAccount>(
            `/payments/payout-accounts/${encodeURIComponent(String(id))}/verify/`
        );
        return unwrap(response.data);
    },

    async setDefaultAccount(id: string | number): Promise<void> {
        await client.post(`/payments/payout-accounts/${encodeURIComponent(String(id))}/default/`);
    },

    async deleteAccount(id: string | number): Promise<void> {
        await client.delete(`/payments/payout-accounts/${encodeURIComponent(String(id))}/`);
    },

    async getStatus(): Promise<{
        has_default_verified_account: boolean;
        default_account: PayoutAccount | null;
    }> {
        const response = await client.get<
            | ApiEnvelope<{
                has_default_verified_account?: boolean;
                default_account?: PayoutAccount | null;
            }>
            | {
                has_default_verified_account?: boolean;
                default_account?: PayoutAccount | null;
            }
        >('/payments/payout-accounts/status/');
        const data = unwrap(response.data);
        return {
            has_default_verified_account: Boolean(data.has_default_verified_account),
            default_account: data.default_account ?? null,
        };
    },

    async getBanksByCountry(countryCode: string): Promise<{ banks: PayoutBank[]; source?: string }> {
        const response = await client.get<ApiEnvelope<PayoutBanksPayload> | PayoutBanksPayload>(
            `/payments/payout-banks/?country=${encodeURIComponent(countryCode)}`
        );
        return unwrapBanks(response.data);
    },

    async searchBanks(query: string): Promise<PayoutBank[]> {
        const response = await client.get<ApiEnvelope<PayoutBanksPayload> | PayoutBanksPayload>(
            `/payments/payout-banks/search/?q=${encodeURIComponent(query)}`
        );
        return unwrapBanks(response.data).banks;
    },

    getId: pickId,
};
