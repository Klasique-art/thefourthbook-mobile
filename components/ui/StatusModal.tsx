import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { useColors } from '@/config/colors';

import AppButton from './AppButton';
import AppModal from './AppModal';
import AppText from './AppText';

type StatusVariant = 'success' | 'error' | 'info';

interface StatusModalProps {
    visible: boolean;
    title: string;
    message: string;
    variant?: StatusVariant;
    onClose: () => void;
}

const StatusModal = ({
    visible,
    title,
    message,
    variant = 'info',
    onClose,
}: StatusModalProps) => {
    const colors = useColors();

    const iconByVariant: Record<StatusVariant, keyof typeof Ionicons.glyphMap> = {
        success: 'checkmark-circle',
        error: 'alert-circle',
        info: 'information-circle',
    };

    const colorByVariant: Record<StatusVariant, string> = {
        success: colors.success,
        error: colors.error,
        info: colors.accent,
    };

    return (
        <AppModal visible={visible} onClose={onClose} title="">
            <View className="items-center px-2 pb-2 pt-1">
                <View
                    className="mb-4 h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${colorByVariant[variant]}22` }}
                >
                    <Ionicons name={iconByVariant[variant]} size={34} color={colorByVariant[variant]} />
                </View>

                <AppText
                    className="mb-2 text-center text-xl font-bold"
                    style={{ color: colors.textPrimary }}
                    accessibilityRole="header"
                    accessibilityLiveRegion="assertive"
                >
                    {title}
                </AppText>

                <AppText
                    className="mb-5 text-center text-sm leading-6"
                    style={{ color: colors.textSecondary }}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                >
                    {message}
                </AppText>

                <AppButton title="Okay" fullWidth onClick={onClose} />
            </View>
        </AppModal>
    );
};

export default StatusModal;
