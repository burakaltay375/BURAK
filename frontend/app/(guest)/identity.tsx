import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, IdentityVerification } from "@/src/api";
import { IdentityVerificationPanel } from "@/src/components/IdentityVerificationPanel";
import { COLORS, SPACING, TYPE } from "@/src/theme";

export default function GuestIdentity() {
  const [identity, setIdentity] = useState<IdentityVerification | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIdentity(await api.myIdentity());
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!identity && !err) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="guest-identity-screen">
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.title}>Kimlik Doğrulama</Text>
          <Text style={s.sub}>Konaklama kaydınız için kimlik bilgilerinizi güvenli şekilde gönderin.</Text>
          {err && <Text style={s.err}>{err}</Text>}
        </View>
        {identity && <IdentityVerificationPanel identity={identity} onChange={setIdentity} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 110 },
  header: { gap: SPACING.sm },
  title: { color: COLORS.onSurface, fontSize: 28, fontFamily: TYPE.display, fontWeight: "800" },
  sub: { color: COLORS.onSurfaceTertiary, lineHeight: 20 },
  err: { color: COLORS.error, fontWeight: "700" },
});
