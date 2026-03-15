import { Ionicons } from '@expo/vector-icons';

// Static quick actions for home screen
export interface QuickAction {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    route?: string; // Navigation route
    action?: string; // Action identifier for special handling
    color: string;
}

export const homeQuickActions: QuickAction[] = [
    {
        id: '1',
        icon: 'wallet',
        label: 'Make Your Contribution',
        route: '/wallet',
        color: '#F38218', // accent
    },
    // {
    //     id: '3',
    //     icon: 'people',
    //     label: 'Invite Your Circle',
    //     action: 'share',
    //     color: '#0f0', // success/green
    // },
    {
        id: '7',
        icon: 'help-circle',
        label: 'How We Work',
        route: 'how_it_works',
        color: '#3B82F6', // readable blue in light/dark themes
    },
    {
        id: '8',
        icon: 'settings',
        label: 'Settings',
        route: '/(tabs)/profile',
        color: '#F38218', // brand accent for better contrast
    },
];

// App configuration constants
export const APP_CONFIG = {
    TARGET_MEMBERS: 50000,
    DISTRIBUTION_THRESHOLD: 1000000, // Distribution triggers at $1M pool
    MONTHLY_PRIZE_POOL: 1000000, // Backward compatibility alias
    WINNERS_PER_DRAW: 5,
    CONTRIBUTION_AMOUNT: 20, // $20 USD
};
