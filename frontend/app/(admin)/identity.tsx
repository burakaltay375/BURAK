import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, View } from "react-native";
import { IdentityAdminList } from "@/src/components/IdentityAdminList";
import { COLORS, SPACING, TYPE } from "@/src/theme";

export default function ManagerIdentity() {
  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="manager-identity-screen">
      <View style={s.header}>
        <Text style={s.title}>Kimlik Doğrulama</Text>
        <Text style={s.sub}>Otelinizdeki misafir ve çalışan doğrulama kayıtları.</Text>
      </View>
      <IdentityAdminList scope="manager" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, gap: SPACING.sm },
  title: { color: COLORS.onSurface, fontSize: 28, fontFamily: TYPE.display, fontWeight: "800" },
  sub: { color: COLORS.onSurfaceTertiary },
});
