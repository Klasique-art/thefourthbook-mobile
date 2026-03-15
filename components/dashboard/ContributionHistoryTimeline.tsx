import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';

import { useColors } from '@/config';
import { Contribution } from '@/data/contributions.dummy';

import AppText from '@/components/ui/AppText';
interface ContributionHistoryTimelineProps {
    contributions: Contribution[];
}

const ContributionHistoryTimeline = ({ contributions }: ContributionHistoryTimelineProps) => {
    const colors = useColors();
    const router = useRouter();

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return colors.success;
            case 'pending': return colors.warning;
            case 'failed': return colors.error;
            default: return colors.textSecondary;
        }
    };

    const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
        switch (status) {
            case 'completed': return 'checkmark-circle';
            case 'pending': return 'time';
            case 'failed': return 'alert-circle';
            default: return 'help-circle';
        }
    };

    return (
        <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3">
                <AppText
                    className="text-lg font-bold"
                    style={{ color: colors.textPrimary }}
                >
                    Recent Transactions
                </AppText>
                <TouchableOpacity onPress={() => router.push('/(tabs)/wallet')}>
                    <AppText
                        className="text-sm font-bold"
                        style={{ color: colors.accent }}
                    >
                        View All
                    </AppText>
                </TouchableOpacity>
            </View>

            <View
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: colors.backgroundAlt }}
            >
                {contributions.length === 0 ? (
                    <View className="p-6 items-center">
                        <Ionicons name="documents-outline" size={48} color={colors.textSecondary} />
                        <AppText
                            className="mt-2 text-center"
                            style={{ color: colors.textSecondary }}
                        >
                            No contributions yet. Start your journey!
                        </AppText>
                    </View>
                ) : (
                    contributions.slice(0, 5).map((item, index) => (
                        <View
                            key={item.contribution_id}
                            className={`p-4 flex-row items-center ${index < contributions.length - 1 ? 'border-b' : ''}`}
                            style={{ borderColor: colors.border }}
                        >
                            <View
                                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                                style={{ backgroundColor: `${getStatusColor(item.status)}15` }}
                            >
                                <Ionicons
                                    name={getStatusIcon(item.status)}
                                    size={20}
                                    color={getStatusColor(item.status)}
                                />
                            </View>
                            <View className="flex-1">
                                <AppText
                                    className="font-bold text-base"
                                    style={{ color: colors.textPrimary }}
                                >
                                    {item.draw_month} Contribution
                                </AppText>
                                <AppText
                                    className="text-xs"
                                    style={{ color: colors.textSecondary }}
                                >
                                    {new Date(item.created_at).toLocaleDateString()} • {item.payment_method}
                                </AppText>
                            </View>
                            <View className="items-end">
                                <AppText
                                    className="font-bold text-base"
                                    style={{ color: item.status === 'failed' ? colors.textSecondary : colors.textPrimary }}
                                >
                                    ${item.amount.toFixed(2)}
                                </AppText>
                                <AppText
                                    className="text-xs capitalize"
                                    style={{ color: getStatusColor(item.status) }}
                                >
                                    {item.status}
                                </AppText>
                            </View>
                        </View>
                    ))
                )}
            </View>
        </View>
    );
};

export default ContributionHistoryTimeline;
