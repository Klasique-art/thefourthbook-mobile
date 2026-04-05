import { Ionicons } from '@expo/vector-icons';
import type { FC } from "react";
import { Pressable, View } from 'react-native';

import { useColors } from '@/config';
import AppButton from "./AppButton";
import AppText from "./AppText";

interface ConfirmActionProps {
    onConfirm: () => void;
    onCancel: () => void;
    title?: string;
    desc?: string;
    confirmBtnTitle?: string;
    isDestructive?: boolean;
}

const ConfirmAction: FC<ConfirmActionProps> = ({
    onConfirm,
    onCancel,
    title = "Confirm Action",
    desc = "Are you sure you want to proceed?",
    confirmBtnTitle = "Confirm",
    isDestructive = true,
}) => {
    const colors = useColors();

    return (
        <View className="p-6" style={{ minHeight: 340, zIndex: 100 }}>
            <View className="items-center" style={{ marginBottom: 18 }}>
                <View
                    className="items-center justify-center"
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        marginBottom: 12,
                        backgroundColor: isDestructive ? 'rgba(220,38,38,0.12)' : 'rgba(243,130,24,0.12)',
                    }}
                >
                    <Ionicons
                        name={isDestructive ? 'warning-outline' : 'help-circle-outline'}
                        size={26}
                        color={isDestructive ? colors.error : colors.accent}
                    />
                </View>
                <AppText
                    className="text-center text-2xl font-bold"
                    style={{ color: isDestructive ? colors.error : colors.primary, marginBottom: 10 }}
                >
                    {title}
                </AppText>
                <AppText
                    className="text-center text-sm"
                    style={{ color: colors.textSecondary, lineHeight: 21, paddingHorizontal: 10 }}
                >
                    {desc}
                </AppText>
            </View>

            <View style={{ gap: 14, marginTop: 6 }}>
                <AppButton
                    title={confirmBtnTitle}
                    variant={isDestructive ? "danger" : "primary"}
                    size="lg"
                    onClick={onConfirm}
                />
                <Pressable
                    onPress={onCancel}
                    accessibilityRole="button"
                    style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.backgroundAlt,
                        paddingVertical: 16,
                        paddingHorizontal: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <AppText className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
                        Cancel
                    </AppText>
                </Pressable>
            </View>
        </View>
    );
};

export default ConfirmAction;
