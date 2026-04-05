type ApiHealthSnapshot = {
    isApiUnavailable: boolean;
    message: string;
    at: number | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();

let snapshot: ApiHealthSnapshot = {
    isApiUnavailable: false,
    message: '',
    at: null,
};

const emit = () => {
    listeners.forEach((listener) => listener());
};

const deriveMessage = (error: any): string => {
    const code = String(error?.code ?? '').toUpperCase();
    const message = String(error?.message ?? '').toLowerCase();

    if (code === 'ECONNABORTED' || message.includes('timeout')) {
        return 'The server is taking too long to respond.';
    }
    return 'We could not reach the server. Please check your connection or backend status.';
};

export const isLikelyUnreachableApiError = (error: any): boolean => {
    const code = String(error?.code ?? '').toUpperCase();
    const message = String(error?.message ?? '').toLowerCase();
    const hasHttpResponse = Boolean(error?.response);
    const hasRequest = Boolean(error?.request);

    if (code === 'ERR_CANCELED') return false;
    if (hasHttpResponse) return false;
    if (code === 'ECONNABORTED') return true;
    if (code === 'ERR_NETWORK') return true;
    if (hasRequest && !hasHttpResponse) return true;
    if (message.includes('network error')) return true;
    if (message.includes('failed to fetch')) return true;
    if (message.includes('timeout')) return true;
    return false;
};

export const markApiUnavailable = (error: any) => {
    const nextMessage = deriveMessage(error);
    const shouldEmit =
        !snapshot.isApiUnavailable || snapshot.message !== nextMessage;

    snapshot = {
        isApiUnavailable: true,
        message: nextMessage,
        at: Date.now(),
    };

    if (shouldEmit) emit();
};

export const markApiAvailable = () => {
    if (!snapshot.isApiUnavailable) return;
    snapshot = {
        isApiUnavailable: false,
        message: '',
        at: null,
    };
    emit();
};

export const getApiHealthSnapshot = (): ApiHealthSnapshot => snapshot;

export const subscribeApiHealth = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

