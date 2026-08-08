import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { COLORS, SPACING, TYPE } from "@/src/theme";

const HOSPIRA_LOGO = require("../../assets/images/icon.png");

export function HospiraMark({ size = 32 }: { size?: number }) {
  return <Image source={HOSPIRA_LOGO} style={{ width: size, height: size, borderRadius: size * 0.22 }} contentFit="contain" />;
}

export default function HospiraBrand({
  compact = false,
  subtitle,
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  const size = compact ? 34 : 58;
  return (
    <View style={s.row} accessibilityLabel="Hospira">
      <HospiraMark size={size} />
      <View>
        <Text style={[s.name, compact && s.nameCompact]}>HOSPIRA</Text>
        {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  name: { color: COLORS.brand, fontFamily: TYPE.display, fontSize: 24, fontWeight: "800", letterSpacing: 2 },
  nameCompact: { fontSize: 16, letterSpacing: 1.5 },
  subtitle: { color: COLORS.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
});
