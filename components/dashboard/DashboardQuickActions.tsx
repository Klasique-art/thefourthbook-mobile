import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';

import { useColors } from '@/config';


import AppText from '@/components/ui/AppText';
const DashboardQuickActions = () => {
    const colors = useColors();
    const router = useRouter();

    const actions = [
        {
            id: 'contribute',
            label: 'Make Contribution',
            icon: 'wallet-outline',
            color: "#ff0000",
            onPress: () => router.push('/(tabs)/wallet'),
        },
        {
            id: 'history',
            label: 'Full History',
            icon: 'time-outline',
            color: "#0000ff",
            onPress: () => router.push('/(tabs)/wallet'),
        },
        // {
        //     id: 'invite',
        //     label: 'Invite Friends',
        //     icon: 'people-outline',
        //     color: "#00ff00",
        //     onPress: () => {
        //         // TODO: Share functionality
        //     },
        // },
        {
            id: 'help',
            label: 'How It Works',
            icon: 'help-circle-outline',
            color: colors.warning,
            onPress: () => router.push('/(tabs)/wallet'),
        },
    ] as const;

    return (
        <View className="mb-8">
            <AppText
                className="text-lg font-bold mb-3"
                style={{ color: colors.textPrimary }}
            >
                Quick Actions
            </AppText>
            <View className="flex-row flex-wrap justify-between">
                {actions.map((action) => (
                    <TouchableOpacity
                        key={action.id}
                        onPress={action.onPress}
                        activeOpacity={0.7}
                        className="w-[48%] mb-4 p-4 rounded-xl items-center justify-center border"
                        style={{
                            backgroundColor: colors.backgroundAlt,
                            borderColor: colors.border
                        }}
                    >
                        <View
                            className="w-12 h-12 items-center justify-center mb-2"
                            style={{ backgroundColor: `${action.color}15`, borderRadius: 99 }}
                        >
                            <Ionicons name={action.icon as any} size={24} color={action.color} />
                        </View>
                        <AppText
                            className="text-sm font-bold text-center"
                            style={{ color: colors.textPrimary }}
                        >
                            {action.label}
                        </AppText>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
};

export default DashboardQuickActions;
