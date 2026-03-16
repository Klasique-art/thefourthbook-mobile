import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { getCalendars, getLocales } from 'expo-localization';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Screen } from '@/components';
import { AppInput } from '@/components/form';
import AppButton from '@/components/ui/AppButton';
import AppText from '@/components/ui/AppText';
import StatusModal from '@/components/ui/StatusModal';
import {
    AutoRenewalToggle,
    PaymentMethodList,
    PaymentStatusCard,
    TransactionHistoryList,
} from '@/components/wallet';
import { Contribution, PaymentMethod } from '@/data/contributions.dummy';
import { PAYMENT_CALLBACK_URL } from '@/config/settings';
import { useTheme } from '@/context/ThemeContext';
import { drawService } from '@/lib/services/drawService';
import { paymentService } from '@/lib/services/paymentService';
import { PayoutBank, payoutAccountService } from '@/lib/services/payoutAccountService';
import { PayoutAccount } from '@/types/payout-account.types';
import { ApiPaymentMethod, PaymentHistoryItem } from '@/types/payment.types';

const PENDING_PAYMENT_REFERENCE_KEY = 'thefourthbook_pending_payment_reference';
const LAST_VERIFIED_PAYMENT_CYCLE_KEY = 'thefourthbook_last_verified_payment_cycle_id';
const WALLET_REFRESH_INTERVAL_MS = 10000;
const SUPPORTED_CHECKOUT_CURRENCIES = ['GHS', 'KES', 'NGN', 'USD', 'XOF', 'ZAR'] as const;
const DEFAULT_CHECKOUT_CURRENCY: (typeof SUPPORTED_CHECKOUT_CURRENCIES)[number] = 'USD';

const COUNTRY_TO_SUPPORTED_CURRENCY: Record<string, (typeof SUPPORTED_CHECKOUT_CURRENCIES)[number]> = {
    GH: 'GHS',
    KE: 'KES',
    NG: 'NGN',
    ZA: 'ZAR',
    BJ: 'XOF',
    BF: 'XOF',
    CI: 'XOF',
    GW: 'XOF',
    ML: 'XOF',
    NE: 'XOF',
    SN: 'XOF',
    TG: 'XOF',
};

const TIMEZONE_TO_SUPPORTED_CURRENCY: Record<string, (typeof SUPPORTED_CHECKOUT_CURRENCIES)[number]> = {
    'Africa/Accra': 'GHS',
    'Africa/Lagos': 'NGN',
    'Africa/Nairobi': 'KES',
    'Africa/Johannesburg': 'ZAR',
    'Africa/Abidjan': 'XOF',
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

const getErrorMessage = (error: any, fallback: string) => {
    const data = error?.response?.data;
    return (
        extractFirstErrorText(data?.error?.details?.error?.details) ||
        extractFirstErrorText(data?.error?.details?.error?.message) ||
        extractFirstErrorText(data?.error?.details?.message) ||
        extractFirstErrorText(data?.error?.details) ||
        extractFirstErrorText(data?.error?.message) ||
        extractFirstErrorText(data?.detail) ||
        extractFirstErrorText(data?.message) ||
        extractFirstErrorText(data?.error) ||
        fallback
    );
};

export default function WalletScreen() {
    const { theme } = useTheme();
    const [isAutoRenewalEnabled, setIsAutoRenewalEnabled] = useState(false);
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
    const [hasPaidCurrentMonth, setHasPaidCurrentMonth] = useState(false);
    const [paidOverrideUntil, setPaidOverrideUntil] = useState<number>(0);
    const [paidOverrideCycleId, setPaidOverrideCycleId] = useState<string | null>(null);
    const [nextDueDate, setNextDueDate] = useState<string>(new Date().toISOString());
    const [transactions, setTransactions] = useState<Contribution[]>([]);
    const [payoutAccounts, setPayoutAccounts] = useState<PayoutAccount[]>([]);
    const [isPayoutLoading, setIsPayoutLoading] = useState(false);
    const [isSavingPayoutAccount, setIsSavingPayoutAccount] = useState(false);
    const [payoutForm, setPayoutForm] = useState({
        bankName: '',
        accountNumber: '',
        bankCode: '',
        countryCode: '',
    });
    const [bankSearchQuery, setBankSearchQuery] = useState('');
    const [bankOptions, setBankOptions] = useState<PayoutBank[]>([]);
    const [bankSource, setBankSource] = useState<string | null>(null);
    const [isBankLookupLoading, setIsBankLookupLoading] = useState(false);
    const [bankLookupNote, setBankLookupNote] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAutoRenewUpdating, setIsAutoRenewUpdating] = useState(false);
    const [currentCycleId, setCurrentCycleId] = useState<string | null>(null);
    const [canPayNow, setCanPayNow] = useState(true);
    const [payDisabledReason, setPayDisabledReason] = useState<string | null>(null);
    const [checkoutCurrency, setCheckoutCurrency] = useState<(typeof SUPPORTED_CHECKOUT_CURRENCIES)[number]>(DEFAULT_CHECKOUT_CURRENCY);
    const [checkoutQuoteLabel, setCheckoutQuoteLabel] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
    const [statusModal, setStatusModal] = useState<{
        visible: boolean;
        title: string;
        message: string;
        variant: 'success' | 'error' | 'info';
    }>({
        visible: false,
        title: '',
        message: '',
        variant: 'info',
    });

    const currentMonthAmount = 20.00;
    const bankLookupRequestIdRef = useRef(0);
    const lastPayoutAccountsRefreshAtRef = useRef(0);

    const payoutStatusPalette = useMemo(
        () => ({
            verified: { bg: theme === 'dark' ? '#14532D66' : '#DCFCE766', text: theme === 'dark' ? '#86EFAC' : '#14532D' },
            manual_review: { bg: theme === 'dark' ? '#713F1266' : '#FEF3C766', text: theme === 'dark' ? '#FDE68A' : '#78350F' },
            failed: { bg: theme === 'dark' ? '#7F1D1D66' : '#FEE2E266', text: theme === 'dark' ? '#FCA5A5' : '#991B1B' },
            unverified: { bg: theme === 'dark' ? '#1E3A8A66' : '#DBEAFE66', text: theme === 'dark' ? '#93C5FD' : '#1E3A8A' },
        }),
        [theme]
    );

    useEffect(() => {
        const locale = getLocales()?.[0];
        const timezone = getCalendars()?.[0]?.timeZone;
        const detectedCurrency = locale?.currencyCode?.toUpperCase?.();
        const region = locale?.regionCode?.toUpperCase?.();

        let chosen = DEFAULT_CHECKOUT_CURRENCY;

        if (detectedCurrency && SUPPORTED_CHECKOUT_CURRENCIES.includes(detectedCurrency as any)) {
            chosen = detectedCurrency as (typeof SUPPORTED_CHECKOUT_CURRENCIES)[number];
        } else if (region && COUNTRY_TO_SUPPORTED_CURRENCY[region]) {
            chosen = COUNTRY_TO_SUPPORTED_CURRENCY[region];
        } else if (timezone && TIMEZONE_TO_SUPPORTED_CURRENCY[timezone]) {
            chosen = TIMEZONE_TO_SUPPORTED_CURRENCY[timezone];
        }

        setCheckoutCurrency(chosen);
    }, []);

    const drawStatusToReason = (status: string): string | null => {
        const normalized = String(status || '').toLowerCase();

        if (normalized === 'open' || normalized === 'collecting') return null;
        if (
            normalized === 'threshold_met_game_pending' ||
            normalized === 'threshold_met_game_open' ||
            normalized === 'threshold_met_game_closed' ||
            normalized === 'closed'
        ) {
            return 'Contributions are closed. Cycle target has been reached and threshold game/distribution steps are in progress.';
        }
        if (normalized === 'drawing' || normalized === 'distribution_processing') {
            return 'Contributions are paused while distribution is being processed.';
        }
        if (normalized === 'completed' || normalized === 'distribution_completed') {
            return 'This cycle is completed. Contributions will reopen for the next cycle.';
        }
        if (normalized === 'cancelled') {
            return 'Contributions are currently unavailable for this cycle.';
        }

        return 'Could not verify if contributions are open. Please try again shortly.';
    };

    const formatDateTimeLabel = (value: string | null): string | null => {
        if (!value) return null;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const paymentStatus: 'paid' | 'unpaid' | 'processing' = useMemo(() => {
        if (isProcessing) return 'processing';
        const hasPaidEffective =
            hasPaidCurrentMonth ||
            (paidOverrideUntil > Date.now() && Boolean(currentCycleId) && paidOverrideCycleId === currentCycleId);
        return hasPaidEffective ? 'paid' : 'unpaid';
    }, [currentCycleId, hasPaidCurrentMonth, isProcessing, paidOverrideCycleId, paidOverrideUntil]);

    const dueLabelOverride = useMemo(() => {
        if (!isAutoRenewalEnabled) return null;
        return paymentStatus === 'paid' ? 'At next cycle end' : 'At current cycle end';
    }, [isAutoRenewalEnabled, paymentStatus]);

    const selectedMethod = useMemo(
        () => methods.find((method) => method.id === selectedMethodId) ?? null,
        [methods, selectedMethodId]
    );
    const isSelectedMethodCard = selectedMethod?.type === 'card';
    const showAutoChargeMethodNotice = isAutoRenewalEnabled;
    const autoChargeNoticeMessage = isSelectedMethodCard
        ? 'Auto-contribute can auto-charge with your selected card method.'
        : 'Auto-contribute does not auto-charge mobile money or bank transfer methods. Use a card method for automatic charging.';
    const autoChargeNoticePalette = useMemo(() => {
        if (isSelectedMethodCard) {
            return theme === 'dark'
                ? { border: '#4ADE80AA', bg: '#14532D66', text: '#86EFAC' }
                : { border: '#16653499', bg: '#DCFCE766', text: '#14532D' };
        }
        return theme === 'dark'
            ? { border: '#FACC15AA', bg: '#713F1266', text: '#FDE68A' }
            : { border: '#92400E99', bg: '#FEF3C766', text: '#78350F' };
    }, [isSelectedMethodCard, theme]);
    const payoutSectionPalette = useMemo(
        () =>
            theme === 'dark'
                ? {
                    sectionBorder: '#33415555',
                    sectionBg: '#0B1220',
                    cardBorder: '#47556988',
                    cardBg: '#111827',
                    title: '#FFFFFF',
                    text: '#CBD5E1',
                }
                : {
                    sectionBorder: '#CBD5E1',
                    sectionBg: '#F8FAFC',
                    cardBorder: '#CBD5E1',
                    cardBg: '#FFFFFF',
                    title: '#0F172A',
                    text: '#334155',
                },
        [theme]
    );

    const lastUpdatedLabel = useMemo(() => formatDateTimeLabel(lastSyncedAt), [lastSyncedAt]);
    const hasSelectedBank = Boolean(payoutForm.bankName.trim() && payoutForm.bankCode.trim());

    const openStatusModal = (title: string, message: string, variant: 'success' | 'error' | 'info') => {
        setStatusModal({ visible: true, title, message, variant });
    };

    const closeStatusModal = () => {
        setStatusModal((prev) => ({ ...prev, visible: false }));
    };

    const toWalletMethod = (method: ApiPaymentMethod): PaymentMethod => ({
        id: String(method.id),
        type: (method.type as PaymentMethod['type']) || 'card',
        brand: ((method.card_brand || 'unknown').toLowerCase() as PaymentMethod['brand']) || 'unknown',
        last4: method.card_last4 || method.account_number?.slice(-4) || '----',
        expiry_month: method.exp_month || undefined,
        expiry_year: method.exp_year || undefined,
        is_default: method.is_default,
    });

    const toContribution = (payment: PaymentHistoryItem): Contribution => {
        const normalizedStatus = String(payment.status || '').toLowerCase();
        const statusMap: Record<string, Contribution['status']> = {
            success: 'completed',
            completed: 'completed',
            pending: 'pending',
            failed: 'failed',
            failure: 'failed',
            error: 'failed',
            cancelled: 'failed',
            canceled: 'failed',
            abandoned: 'failed',
            refunded: 'refunded',
        };
        let mappedStatus = statusMap[normalizedStatus] || 'pending';
        if (mappedStatus === 'pending') {
            const createdMs = new Date(payment.created_at).getTime();
            const ageMinutes = Number.isNaN(createdMs) ? 0 : (Date.now() - createdMs) / 60000;
            if (ageMinutes > 5) {
                mappedStatus = 'failed';
            }
        }
        const rawAmount = Number(payment.amount);
        const isMonthlySubscription = String(payment.purpose || '').toLowerCase() === 'monthly_subscription';
        const normalizedAmount =
            isMonthlySubscription || mappedStatus === 'failed'
                ? 20
                : Number.isFinite(rawAmount)
                    ? rawAmount
                    : 20;

        return {
            contribution_id: payment.payment_id,
            amount: normalizedAmount,
            currency: payment.currency,
            status: mappedStatus,
            type: 'contribution',
            payment_method: payment.payment_method?.card_brand || payment.payment_method?.bank_name || 'Payment',
            payment_method_last4:
                payment.payment_method?.card_last4 || payment.payment_method?.account_number?.slice(-4) || '----',
            created_at: payment.created_at,
            completed_at: payment.completed_at,
            draw_month: payment.month,
            draw_entry_id: null,
        };
    };

    const isSettledPaymentStatus = (status: string | null | undefined) => {
        const normalized = String(status || '').toLowerCase();
        return normalized === 'success' || normalized === 'completed' || normalized === 'paid';
    };

    const getPayoutStatusLabel = (status: string | null | undefined) => {
        const normalized = String(status || 'unverified').toLowerCase();
        if (normalized === 'verified') return 'Verified';
        if (normalized === 'manual_review') return 'Manual Review';
        if (normalized === 'failed') return 'Failed';
        return 'Unverified';
    };

    const getPayoutAccountNumberLabel = (account: PayoutAccount) => {
        const raw = account.account_number_masked || account.account_number || '';
        if (!raw) return 'No account number';
        const compact = String(raw).replace(/\s+/g, '');
        if (compact.includes('*')) return compact;
        if (compact.length <= 4) return compact;
        return `****${compact.slice(-4)}`;
    };

    const loadPayoutAccounts = useCallback(async (silent = false) => {
        if (!silent) setIsPayoutLoading(true);
        try {
            const accounts = await payoutAccountService.getAccounts();
            setPayoutAccounts(accounts);
            lastPayoutAccountsRefreshAtRef.current = Date.now();
        } catch (error: any) {
            if (!silent) {
                openStatusModal('Payout Accounts', getErrorMessage(error, 'Could not load payout accounts.'), 'error');
            }
        } finally {
            if (!silent) setIsPayoutLoading(false);
        }
    }, []);

    const loadWalletData = useCallback(async () => {
        try {
            const [status, apiMethods, history, currentDraw] = await Promise.all([
                paymentService.getCurrentMonthStatus(),
                paymentService.getPaymentMethods(),
                paymentService.getPaymentHistory(),
                drawService.getCurrentDraw(),
            ]);

            const mappedMethods = apiMethods.map(toWalletMethod);
            setMethods(mappedMethods);
            setSelectedMethodId(mappedMethods.find((m) => m.is_default)?.id ?? mappedMethods[0]?.id ?? null);
            setCurrentCycleId(currentDraw?.draw_id ?? null);

            const hasPaidMatchingCycle = history.some(
                (payment) => isSettledPaymentStatus(payment.status) && payment.month === status.month
            );

            const hasPaidResolved = Boolean(status.has_paid || hasPaidMatchingCycle);
            setHasPaidCurrentMonth(hasPaidResolved);
            if (hasPaidResolved) {
                setPaidOverrideUntil(0);
                setPaidOverrideCycleId(null);
            } else if (paidOverrideCycleId && paidOverrideCycleId !== currentDraw?.draw_id) {
                setPaidOverrideUntil(0);
                setPaidOverrideCycleId(null);
            }
            setIsAutoRenewalEnabled(Boolean(status.auto_renew_enabled));

            const resolvedDueDate =
                status.next_payment_date ||
                new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();
            setNextDueDate(resolvedDueDate);

            setTransactions(history.map(toContribution).slice(0, 20));
            const reason = drawStatusToReason(currentDraw.status);
            setCanPayNow(!reason);
            setPayDisabledReason(reason);
        } catch (error: any) {
            openStatusModal('Wallet Error', getErrorMessage(error, 'Could not load wallet data.'), 'error');
            // Fail-safe to avoid payment loopholes when cycle state is unknown.
            setCanPayNow(false);
            setPayDisabledReason('Could not verify if contributions are open. Please try again shortly.');
        } finally {
            setLastSyncedAt(new Date().toISOString());
        }
    }, [paidOverrideCycleId]);

    useEffect(() => {
        void loadWalletData();
        void loadPayoutAccounts();
    }, [loadPayoutAccounts, loadWalletData]);

    const verifyPendingPaymentIfAny = useCallback(async () => {
        const pendingReference = await AsyncStorage.getItem(PENDING_PAYMENT_REFERENCE_KEY);
        if (!pendingReference) return;

        try {
            await paymentService.verifyPayment(pendingReference);
            await AsyncStorage.removeItem(PENDING_PAYMENT_REFERENCE_KEY);
            setHasPaidCurrentMonth(true);
            setPaidOverrideUntil(Date.now() + 30 * 60 * 1000);
            const draw = await drawService.getCurrentDraw();
            setPaidOverrideCycleId(draw?.draw_id ?? null);
            if (draw?.draw_id) {
                await AsyncStorage.setItem(LAST_VERIFIED_PAYMENT_CYCLE_KEY, draw.draw_id);
            }
            await loadWalletData();
            openStatusModal('Success', 'Your contribution was confirmed after returning to the app.', 'success');
        } catch {
            // Payment may still be processing on provider side; keep pending reference for later retry.
        }
    }, [loadWalletData]);

    useFocusEffect(
        useCallback(() => {
            void loadWalletData();
            void loadPayoutAccounts(true);
            void verifyPendingPaymentIfAny();

            const poller = setInterval(() => {
                void loadWalletData();
                if (Date.now() - lastPayoutAccountsRefreshAtRef.current > 30000) {
                    void loadPayoutAccounts(true);
                }
            }, WALLET_REFRESH_INTERVAL_MS);

            return () => clearInterval(poller);
        }, [loadPayoutAccounts, loadWalletData, verifyPendingPaymentIfAny])
    );

    const handleRefreshWallet = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([loadWalletData(), loadPayoutAccounts(true)]);
        } finally {
            setIsRefreshing(false);
        }
    }, [loadPayoutAccounts, loadWalletData]);

    const handlePayoutFormChange = useCallback((key: keyof typeof payoutForm, value: string) => {
        setPayoutForm((prev) => ({ ...prev, [key]: value }));
    }, []);

    const runBankSearch = useCallback(
        async (queryText: string, countryCodeFilter: string) => {
            const requestId = ++bankLookupRequestIdRef.current;
            const trimmedQuery = queryText.trim();
            if (trimmedQuery.length < 2) {
                setBankOptions([]);
                setBankLookupNote(null);
                setIsBankLookupLoading(false);
                return;
            }

            setIsBankLookupLoading(true);
            try {
                const banks = await payoutAccountService.searchBanks(trimmedQuery);
                if (requestId !== bankLookupRequestIdRef.current) return;
                const normalizedCountry = countryCodeFilter.trim().toUpperCase();
                const filtered = normalizedCountry
                    ? banks.filter((bank) => String(bank.country_code || '').toUpperCase() === normalizedCountry)
                    : banks;
                setBankOptions(filtered);
                setBankSource(filtered[0]?.source ?? null);
                setBankLookupNote(filtered.length === 0 ? 'No bank matches found from search.' : null);
            } catch {
                if (requestId !== bankLookupRequestIdRef.current) return;
                setBankOptions([]);
                setBankLookupNote('Could not search banks right now. You can still enter bank details manually.');
            } finally {
                if (requestId === bankLookupRequestIdRef.current) setIsBankLookupLoading(false);
            }
        },
        []
    );

    const handleLoadBanksByCountry = useCallback(async () => {
        const countryCode = payoutForm.countryCode.trim().toUpperCase();
        if (countryCode.length !== 2) {
            openStatusModal('Country Code Required', 'Enter a valid 2-letter country code first (for example: US, NG, GH).', 'info');
            return;
        }
        setIsBankLookupLoading(true);
        try {
            const payload = await payoutAccountService.getBanksByCountry(countryCode);
            setBankOptions(payload.banks);
            setBankSource(payload.source ?? null);
            if (payload.banks.length === 0) {
                setBankLookupNote('No banks found for this country. Manual details may be required.');
            } else if (String(payload.source || '').toLowerCase() === 'manual') {
                setBankLookupNote('Manual verification route detected. Enter bank name and bank code if needed.');
            } else {
                setBankLookupNote(null);
            }
        } catch (error: any) {
            setBankOptions([]);
            setBankLookupNote(null);
            openStatusModal('Bank Lookup Failed', getErrorMessage(error, 'Could not load banks for this country.'), 'error');
        } finally {
            setIsBankLookupLoading(false);
        }
    }, [payoutForm.countryCode]);

    const handleSelectBankOption = useCallback((bank: PayoutBank) => {
        setPayoutForm((prev) => ({
            ...prev,
            bankName: bank.bank_name,
            bankCode: bank.bank_code,
            countryCode: String(bank.country_code || prev.countryCode).toUpperCase(),
        }));
        setBankSearchQuery(bank.bank_name);
        setBankLookupNote(null);
    }, []);

    useEffect(() => {
        const query = bankSearchQuery.trim();
        const country = payoutForm.countryCode.trim().toUpperCase();
        const timer = setTimeout(() => {
            void runBankSearch(query, country);
        }, 300);
        return () => clearTimeout(timer);
    }, [bankSearchQuery, payoutForm.countryCode, runBankSearch]);

    const handleSavePayoutAccount = useCallback(async () => {
        const bankName = payoutForm.bankName.trim();
        const accountNumber = payoutForm.accountNumber.replace(/\s+/g, '');
        const bankCode = payoutForm.bankCode.trim();
        const countryCode = payoutForm.countryCode.trim().toUpperCase();

        if (!bankName || !accountNumber || !bankCode || countryCode.length !== 2) {
            openStatusModal('Missing Details', 'Country code, bank name, account number, and bank code are required.', 'info');
            return;
        }

        setIsSavingPayoutAccount(true);
        try {
            const created = await payoutAccountService.createAccount({
                bank_name: bankName,
                account_number: accountNumber,
                bank_code: bankCode,
                country_code: countryCode,
                is_default: payoutAccounts.length === 0,
            });
            const verified = await payoutAccountService.verifyAccount(payoutAccountService.getId(created));
            const status = String(verified.verification_status || 'unverified').toLowerCase();
            if (status === 'manual_review') {
                openStatusModal('Account Submitted', "We'll verify this bank account and notify you.", 'info');
            } else if (status === 'verified') {
                openStatusModal('Payout Account Ready', 'Your payout bank account has been verified.', 'success');
            } else {
                openStatusModal('Verification Pending', 'Your payout account was saved. You can retry verification if needed.', 'info');
            }
            setPayoutForm({
                bankName: '',
                accountNumber: '',
                bankCode: '',
                countryCode: '',
            });
            setBankSearchQuery('');
            setBankOptions([]);
            setBankLookupNote(null);
            await loadPayoutAccounts();
        } catch (error: any) {
            openStatusModal('Payout Account', getErrorMessage(error, 'Could not save payout account.'), 'error');
        } finally {
            setIsSavingPayoutAccount(false);
        }
    }, [loadPayoutAccounts, payoutAccounts.length, payoutForm]);

    const handleSetDefaultPayoutAccount = useCallback(async (id: string | number) => {
        try {
            await payoutAccountService.setDefaultAccount(id);
            await loadPayoutAccounts();
            openStatusModal('Default Updated', 'Default payout account was updated.', 'success');
        } catch (error: any) {
            openStatusModal('Payout Account', getErrorMessage(error, 'Could not set default payout account.'), 'error');
        }
    }, [loadPayoutAccounts]);

    const handleVerifyPayoutAccount = useCallback(async (id: string | number) => {
        try {
            const updated = await payoutAccountService.verifyAccount(id);
            await loadPayoutAccounts();
            const status = String(updated.verification_status || 'unverified').toLowerCase();
            if (status === 'verified') {
                openStatusModal('Verified', 'This payout account is now verified.', 'success');
            } else if (status === 'manual_review') {
                openStatusModal('Manual Review', "We'll verify and notify you once this account is approved.", 'info');
            } else {
                openStatusModal('Verification Failed', 'Please update account details and retry verification.', 'error');
            }
        } catch (error: any) {
            openStatusModal('Payout Account', getErrorMessage(error, 'Could not verify payout account.'), 'error');
        }
    }, [loadPayoutAccounts]);

    const handleDeletePayoutAccount = useCallback(async (id: string | number) => {
        try {
            await payoutAccountService.deleteAccount(id);
            await loadPayoutAccounts();
            openStatusModal('Removed', 'Payout account removed.', 'success');
        } catch (error: any) {
            openStatusModal('Payout Account', getErrorMessage(error, 'Could not remove payout account.'), 'error');
        }
    }, [loadPayoutAccounts]);

    const handlePayNow = async () => {
        if (!canPayNow) {
            openStatusModal('Contributions Closed', payDisabledReason ?? 'Contributions are currently unavailable for this cycle.', 'info');
            return;
        }

        const isVerifiedAccount = (account: PayoutAccount | null | undefined) =>
            String(account?.verification_status || '').toLowerCase() === 'verified';
        const hasVerifiedAccountInList = (accounts: PayoutAccount[]) =>
            accounts.some((account) => isVerifiedAccount(account));

        let hasVerifiedPayoutAccount = hasVerifiedAccountInList(payoutAccounts);

        if (!hasVerifiedPayoutAccount) {
            try {
                const latestAccounts = await payoutAccountService.getAccounts();
                if (latestAccounts.length > 0) {
                    setPayoutAccounts(latestAccounts);
                    hasVerifiedPayoutAccount = hasVerifiedAccountInList(latestAccounts);
                }
            } catch {
                // Continue with status check below as fallback signal.
            }
        }

        try {
            const payoutStatus = await payoutAccountService.getStatus();
            hasVerifiedPayoutAccount =
                hasVerifiedPayoutAccount ||
                Boolean(payoutStatus.has_default_verified_account) ||
                isVerifiedAccount(payoutStatus.default_account);
        } catch (error: any) {
            if (!hasVerifiedPayoutAccount) {
                openStatusModal(
                    'Payout Account Check',
                    getErrorMessage(error, 'Could not confirm your payout account setup. Please try again.'),
                    'error'
                );
                return;
            }
        }

        if (!hasVerifiedPayoutAccount) {
            openStatusModal(
                'Verify Payout Account First',
                'Before paying into a cycle, please add and verify your payout bank account in this Wallet screen.',
                'info'
            );
            return;
        }

        setIsProcessing(true);
        try {
            const appReturnUrl = PAYMENT_CALLBACK_URL || Linking.createURL('payments/callback');
            const callbackUrlForBackend = /^https?:\/\//i.test(appReturnUrl) ? appReturnUrl : undefined;
            console.log(`[Wallet] app return URL (for browser session): ${appReturnUrl}`);
            if (!callbackUrlForBackend) {
                console.log('[Wallet] callback_url not sent to backend because it is not an http/https URL.');
            }
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const primaryPayload = {
                payment_method_id: selectedMethodId ? Number(selectedMethodId) : undefined,
                auto_renew: isAutoRenewalEnabled,
                month,
                callback_url: callbackUrlForBackend,
                currency: checkoutCurrency,
                allow_currency_fallback: false,
            };
            console.log(`[Wallet] initialize payload (primary): ${JSON.stringify(primaryPayload)}`);

            let initialized;
            try {
                initialized = await paymentService.initializeMonthlyPayment(primaryPayload);
            } catch (error: any) {
                if (error?.response?.status !== 500) throw error;

                // Backend currently throws TypeError for some optional fields in initialize.
                const fallbackPayload = {
                    auto_renew: isAutoRenewalEnabled,
                    callback_url: callbackUrlForBackend,
                    currency: checkoutCurrency,
                    allow_currency_fallback: false,
                };
                console.log(`[Wallet] initialize payload (fallback): ${JSON.stringify(fallbackPayload)}`);
                initialized = await paymentService.initializeMonthlyPayment(fallbackPayload);
            }

            const initializedAmount = Number(initialized.amount);
            const initializedCurrency = initialized.currency || checkoutCurrency;
            const exchangeRate = initialized.exchange_rate;
            if (Number.isFinite(initializedAmount)) {
                const quote = `${initializedAmount.toLocaleString('en-US')} ${initializedCurrency}${exchangeRate ? ` (rate: ${exchangeRate})` : ''}`;
                setCheckoutQuoteLabel(`Checkout quote: ${quote}`);
            } else {
                setCheckoutQuoteLabel(`Checkout quote currency: ${initializedCurrency}`);
            }
            await AsyncStorage.setItem(PENDING_PAYMENT_REFERENCE_KEY, initialized.reference);

            const checkoutResult = await WebBrowser.openAuthSessionAsync(
                initialized.authorization_url,
                appReturnUrl
            );

            const tryVerify = async () => {
                await paymentService.verifyPayment(initialized.reference);
                await AsyncStorage.removeItem(PENDING_PAYMENT_REFERENCE_KEY);
                setHasPaidCurrentMonth(true);
                setPaidOverrideUntil(Date.now() + 30 * 60 * 1000);
                const draw = await drawService.getCurrentDraw();
                setPaidOverrideCycleId(draw?.draw_id ?? null);
                if (draw?.draw_id) {
                    await AsyncStorage.setItem(LAST_VERIFIED_PAYMENT_CYCLE_KEY, draw.draw_id);
                }
                await loadWalletData();
                openStatusModal('Success', 'Your contribution for this month has been received!', 'success');
            };

            try {
                await tryVerify();
            } catch {
                if (checkoutResult.type === 'cancel') {
                    openStatusModal(
                        'Payment Not Confirmed Yet',
                        'Checkout was closed before callback. If you completed payment, open Wallet again in a few seconds to refresh verification.',
                        'info'
                    );
                    return;
                }
                throw new Error('Payment could not be confirmed yet.');
            }
        } catch (error: any) {
            const message = getErrorMessage(error, 'Payment could not be completed.');
            if (message.toLowerCase().includes('currency') && message.toLowerCase().includes('not enabled')) {
                if (checkoutCurrency !== DEFAULT_CHECKOUT_CURRENCY) {
                    setCheckoutCurrency(DEFAULT_CHECKOUT_CURRENCY);
                }
                openStatusModal(
                    'Unsupported Currency',
                    `The selected currency (${checkoutCurrency}) is not enabled for this merchant. Allowed: ${SUPPORTED_CHECKOUT_CURRENCIES.join(', ')}. Switched to ${DEFAULT_CHECKOUT_CURRENCY}. Please retry payment.`,
                    'info'
                );
                return;
            }
            openStatusModal('Payment Failed', message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleToggleAutoRenewal = async (value: boolean) => {
        if (isAutoRenewUpdating) return;
        setIsAutoRenewUpdating(true);
        try {
            const updated = await paymentService.updateAutoRenew({ auto_renew: value });
            setIsAutoRenewalEnabled(Boolean(updated.auto_renew));
            await loadWalletData();
            openStatusModal(
                'Auto-Contribute Updated',
                `Auto-contribute is now ${updated.auto_renew ? 'enabled' : 'disabled'}.`,
                'success'
            );
        } catch (error: any) {
            openStatusModal(
                'Auto-Renew Failed',
                getErrorMessage(error, 'Could not update auto-renew preference.'),
                'error'
            );
        } finally {
            setIsAutoRenewUpdating(false);
        }
    };

    const handleSelectMethod = async (id: string) => {
        try {
            setSelectedMethodId(id);
            await paymentService.setDefaultPaymentMethod(Number(id));
            await loadWalletData();
        } catch (error: any) {
            openStatusModal(
                'Payment Method',
                getErrorMessage(error, 'Could not set default payment method.'),
                'error'
            );
        }
    };

    return (
        <Screen>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefreshWallet}
                        tintColor="#0ea5e9"
                        colors={['#0ea5e9']}
                        title="Refreshing wallet"
                    />
                }
            >
                <View className="pt-2">
                    <View className="mb-2 flex-row items-center justify-between px-1">
                        <AppText
                            className="text-xs"
                            accessibilityLiveRegion="polite"
                            style={{ opacity: 0.75 }}
                        >
                            {lastUpdatedLabel ? `Last updated: ${lastUpdatedLabel}` : 'Checking wallet status...'}
                        </AppText>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Refresh wallet data"
                            onPress={handleRefreshWallet}
                            disabled={isRefreshing}
                        >
                            <AppText className="text-xs font-semibold" style={{ opacity: isRefreshing ? 0.6 : 1 }}>
                                {isRefreshing ? 'Refreshing...' : 'Refresh'}
                            </AppText>
                        </Pressable>
                    </View>

                    <PaymentStatusCard
                        status={paymentStatus}
                        amount={currentMonthAmount}
                        nextDueDate={nextDueDate}
                        dueLabelOverride={dueLabelOverride}
                        onPayPress={handlePayNow}
                        isProcessing={isProcessing}
                        canPayNow={canPayNow}
                        payDisabledReason={payDisabledReason}
                        checkoutQuoteLabel={checkoutQuoteLabel}
                    />

                    <PaymentMethodList
                        methods={methods.map((m) => ({
                            ...m,
                            is_default: m.id === selectedMethodId,
                        }))}
                        onSelectMethod={handleSelectMethod}
                    />

                    <View
                        className="mb-4 rounded-2xl border p-4"
                        style={{ borderColor: payoutSectionPalette.sectionBorder, backgroundColor: payoutSectionPalette.sectionBg }}
                    >
                        <AppText className="text-base font-bold" style={{ color: payoutSectionPalette.title }}>
                            Payout Bank Accounts
                        </AppText>
                        <AppText className="mt-1 text-xs" style={{ color: payoutSectionPalette.text }}>
                            Add where winnings should be sent. Card or mobile money methods are not used for payout destination.
                        </AppText>
                        <AppText className="mt-1 text-xs" style={{ color: payoutSectionPalette.text }} accessibilityRole="text">
                            Set a default verified bank account to receive payouts faster.
                        </AppText>

                        {isPayoutLoading ? (
                            <AppText className="mt-3 text-xs" style={{ color: payoutSectionPalette.text }}>
                                Loading payout accounts...
                            </AppText>
                        ) : payoutAccounts.length === 0 ? (
                            <AppText className="mt-3 text-xs" style={{ color: payoutSectionPalette.text }}>
                                No payout bank account added yet.
                            </AppText>
                        ) : (
                            payoutAccounts.map((account) => {
                                const statusKey = String(account.verification_status || 'unverified').toLowerCase() as keyof typeof payoutStatusPalette;
                                const palette = payoutStatusPalette[statusKey] || payoutStatusPalette.unverified;
                                const accountId = payoutAccountService.getId(account);
                                return (
                                    <View
                                        key={String(accountId)}
                                        className="mt-3 rounded-xl border p-3"
                                        style={{
                                            borderColor: payoutSectionPalette.cardBorder,
                                            backgroundColor: payoutSectionPalette.cardBg,
                                        }}
                                    >
                                        <View className="flex-row items-center justify-between">
                                            <AppText className="text-sm font-semibold" style={{ color: payoutSectionPalette.title }}>
                                                {account.bank_name || 'Bank Account'} {account.is_default ? '(Default)' : ''}
                                            </AppText>
                                            <View className="rounded-full px-3 py-1" style={{ backgroundColor: palette.bg }}>
                                                <AppText className="text-[11px] font-semibold uppercase" style={{ color: palette.text }}>
                                                    {getPayoutStatusLabel(account.verification_status)}
                                                </AppText>
                                            </View>
                                        </View>
                                        <AppText className="mt-1 text-xs" style={{ color: payoutSectionPalette.text }}>
                                            {(account.account_name || 'Account holder pending')} - {getPayoutAccountNumberLabel(account)}
                                        </AppText>
                                        {String(account.verification_status || '').toLowerCase() === 'verified' && account.account_name ? (
                                            <AppText className="mt-1 text-xs font-semibold" style={{ color: payoutSectionPalette.text }}>
                                                Verified account holder: {account.account_name}
                                            </AppText>
                                        ) : null}

                                        <View className="mt-3 flex-row flex-wrap gap-2">
                                            {!account.is_default ? (
                                                <AppButton
                                                    title="Set Default"
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => handleSetDefaultPayoutAccount(accountId)}
                                                    accessibilityLabel={`Set ${account.bank_name || 'bank account'} as default payout account`}
                                                />
                                            ) : null}
                                            {String(account.verification_status || '').toLowerCase() !== 'verified' ? (
                                                <AppButton
                                                    title="Verify"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleVerifyPayoutAccount(accountId)}
                                                    accessibilityLabel={`Verify ${account.bank_name || 'bank account'}`}
                                                />
                                            ) : null}
                                            <AppButton
                                                title="Remove"
                                                size="sm"
                                                variant="danger"
                                                onClick={() => handleDeletePayoutAccount(accountId)}
                                                accessibilityLabel={`Remove ${account.bank_name || 'bank account'}`}
                                            />
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        {payoutAccounts.length === 0 ? (
                            <View
                                className="mt-4 rounded-xl border p-3"
                                style={{ borderColor: payoutSectionPalette.cardBorder, backgroundColor: payoutSectionPalette.cardBg }}
                            >
                                <AppText className="text-sm font-semibold" style={{ color: payoutSectionPalette.title }}>
                                    Add Bank Account
                                </AppText>
                                <View className="mt-3 gap-3">
                                    <AppInput
                                        name="payout-country-code"
                                        label="Country Code"
                                        value={payoutForm.countryCode}
                                        onChange={(value) => handlePayoutFormChange('countryCode', value.toUpperCase())}
                                        placeholder="e.g. US, NG, GH"
                                        autoCapitalize="characters"
                                        maxLength={2}
                                        accessibilityHint="Required 2-letter country code."
                                    />
                                    <AppInput
                                        name="payout-bank-search"
                                        label="Search Bank"
                                        value={bankSearchQuery}
                                        onChange={setBankSearchQuery}
                                        placeholder="Type bank name (minimum 2 letters)"
                                        autoCapitalize="words"
                                        accessibilityHint="Search and select a bank to auto-fill bank name and bank code."
                                    />
                                    {!hasSelectedBank ? (
                                        <AppButton
                                            title={isBankLookupLoading ? 'Loading Banks...' : 'Load Country Banks'}
                                            size="sm"
                                            variant="outline"
                                            onClick={handleLoadBanksByCountry}
                                            loading={isBankLookupLoading}
                                            accessibilityLabel="Load payout banks for selected country"
                                        />
                                    ) : null}
                                    {isBankLookupLoading ? (
                                        <AppText className="text-xs" style={{ color: payoutSectionPalette.text }} accessibilityLiveRegion="polite">
                                            Searching banks...
                                        </AppText>
                                    ) : null}
                                    {bankLookupNote ? (
                                        <AppText className="text-xs" style={{ color: payoutSectionPalette.text }} accessibilityLiveRegion="polite">
                                            {bankLookupNote}
                                        </AppText>
                                    ) : null}
                                    {bankSource ? (
                                        <AppText className="text-xs" style={{ color: payoutSectionPalette.text }} accessibilityLiveRegion="polite">
                                            Bank source: {bankSource}
                                        </AppText>
                                    ) : null}
                                    {bankOptions.slice(0, 8).map((bank, idx) => (
                                        <Pressable
                                            key={`${bank.bank_code}-${idx}`}
                                            className="rounded-lg border px-3 py-2"
                                            style={{ borderColor: payoutSectionPalette.cardBorder, backgroundColor: payoutSectionPalette.sectionBg }}
                                            onPress={() => handleSelectBankOption(bank)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Use ${bank.bank_name} (${bank.country_code})`}
                                            accessibilityHint="Fills bank name and bank code."
                                        >
                                            <AppText className="text-sm font-semibold" style={{ color: payoutSectionPalette.title }}>
                                                {bank.bank_name}
                                            </AppText>
                                            <AppText className="text-xs" style={{ color: payoutSectionPalette.text }}>
                                                Code: {bank.bank_code} {bank.source ? `- Source: ${bank.source}` : ''}
                                            </AppText>
                                        </Pressable>
                                    ))}
                                    <AppInput
                                        name="payout-bank-name"
                                        label="Bank Name"
                                        value={payoutForm.bankName}
                                        onChange={(value) => handlePayoutFormChange('bankName', value)}
                                        placeholder="Auto-filled from selected bank"
                                        editable={false}
                                        selectTextOnFocus={false}
                                        autoCapitalize="words"
                                        accessibilityHint="Read-only. Select a bank above to fill this value."
                                    />
                                    <AppInput
                                        name="payout-account-number"
                                        label="Account Number"
                                        value={payoutForm.accountNumber}
                                        onChange={(value) => handlePayoutFormChange('accountNumber', value)}
                                        placeholder="Enter account number"
                                        keyboardType="number-pad"
                                        autoCapitalize="none"
                                    />
                                    <AppInput
                                        name="payout-bank-code"
                                        label="Bank Code"
                                        value={payoutForm.bankCode}
                                        onChange={(value) => handlePayoutFormChange('bankCode', value)}
                                        placeholder="Auto-filled from selected bank"
                                        editable={false}
                                        selectTextOnFocus={false}
                                        autoCapitalize="characters"
                                        accessibilityHint="Read-only. Select a bank above to fill this value."
                                    />
                                    <AppButton
                                        title={isSavingPayoutAccount ? 'Saving...' : 'Save Payout Account'}
                                        icon="save-outline"
                                        onClick={handleSavePayoutAccount}
                                        loading={isSavingPayoutAccount}
                                        fullWidth
                                        accessibilityLabel="Save payout bank account"
                                    />
                                    <AppText className="text-xs" style={{ color: payoutSectionPalette.text }}>
                                        Account holder name is resolved by backend after verification.
                                    </AppText>
                                </View>
                            </View>
                        ) : null}
                    </View>

                    {showAutoChargeMethodNotice && (
                        <View
                            className="mb-4 rounded-xl border px-4 py-3"
                            style={{
                                borderColor: autoChargeNoticePalette.border,
                                backgroundColor: autoChargeNoticePalette.bg,
                            }}
                            accessibilityRole="alert"
                            accessibilityLiveRegion="polite"
                        >
                            <AppText className="text-sm font-semibold" style={{ color: autoChargeNoticePalette.text }}>
                                Auto-Charge Method Check
                            </AppText>
                            <AppText className="mt-1 text-xs" style={{ color: autoChargeNoticePalette.text }}>
                                {autoChargeNoticeMessage}
                            </AppText>
                        </View>
                    )}

                    <AutoRenewalToggle
                        isEnabled={isAutoRenewalEnabled}
                        disabled={isProcessing}
                        isUpdating={isAutoRenewUpdating}
                        onToggle={handleToggleAutoRenewal}
                    />

                    <TransactionHistoryList
                        transactions={transactions}
                    />
                </View>
            </ScrollView>

            <StatusModal
                visible={statusModal.visible}
                title={statusModal.title}
                message={statusModal.message}
                variant={statusModal.variant}
                onClose={closeStatusModal}
            />
        </Screen>
    );
}

