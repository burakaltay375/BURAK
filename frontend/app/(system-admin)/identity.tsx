import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, View } from "react-native";
import { IdentityAdminList } from "@/src/components/IdentityAdminList";
import { COLORS, SPACING, TYPE } from "@/src/theme";

export default function SystemIdentity() {
  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="system-identity-screen">
      <View style={s.header}>
        <Text style={s.title}>Kimlik Doğrulama</Text>
        <Text style={s.sub}>Platform genelindeki kimlik doğrulama kayıtları.</Text>
      </View>
      <IdentityAdminList scope="system" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, gap: SPACING.sm },
  title: { color: COLORS.onSurface, fontSize: 28, fontFamily: TYPE.display, fontWeight: "800" },
  sub: { color: COLORS.onSurfaceTertiary },
});
