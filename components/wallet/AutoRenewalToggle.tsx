import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Switch, View } from 'react-native';

import { useColors } from '@/config';

import AppText from '@/components/ui/AppText';
interface AutoRenewalToggleProps {
    isEnabled: boolean;
    disabled?: boolean;
    isUpdating?: boolean;
    onToggle: (value: boolean) => void;
}

const AutoRenewalToggle = ({ isEnabled, disabled = false, isUpdating = false, onToggle }: AutoRenewalToggleProps) => {
    const colors = useColors();

    return (
        <View
            className="p-4 rounded-xl mb-6 border flex-row items-center justify-between"
            style={{
                backgroundColor: colors.backgroundAlt,
                borderColor: colors.border
            }}
        >
            <View className="flex-1 mr-4">
                <View className="flex-row items-center mb-1">
                    <Ionicons name="refresh-circle" size={20} color={colors.accent} style={{ marginRight: 6 }} />
                    <AppText
                        className="font-bold text-base"
                        style={{ color: colors.textPrimary }}
                    >
                        Auto-Contribute
                    </AppText>
                </View>
                <AppText style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                    Automatically contribute $20 when a cycle closes so you never miss eligibility.
                </AppText>
            </View>
            <Switch
                trackColor={{ false: colors.border, true: colors.success }}
                thumbColor={isEnabled ? '#FFF' : '#f4f3f4'}
                ios_backgroundColor="#3e3e3e"
                onValueChange={onToggle}
                value={isEnabled}
                disabled={disabled || isUpdating}
                accessibilityLabel={isUpdating ? 'Updating auto-contribute setting' : 'Toggle auto-contribute'}
                accessibilityHint="Turns automatic cycle contribution on or off"
            />
        </View>
    );
};

export default AutoRenewalToggle;
