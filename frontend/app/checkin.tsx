import { useState } from "react";
import type { ReactNode } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, setToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { dashboardRouteForRole } from "@/src/roles";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

export default function Checkin() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (password.length < 4) { setErr("Şifre en az 4 karakter olmalı"); return; }
    if (password !== confirm) { setErr("Şifreler eşleşmiyor"); return; }
    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const r = await api.checkin({
        email: email.trim(),
        access_code: code.trim().toUpperCase(),
        new_password: password,
      });
      await setToken(r.token);
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(dashboardRouteForRole(r.user.role));
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="checkin-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} testID="checkin-back-button" style={s.backBtn}>
            <Text style={s.back}>‹ Geri</Text>
          </Pressable>
          <Text style={s.title}>Otele Giriş (Check-in)</Text>
          <Text style={s.subtitle}>Giriş kodunuzla hesabınızı aktive edin ve kendi şifrenizi belirleyin.</Text>

          {err && <Text style={s.err} testID="checkin-error">{err}</Text>}

          <Field icon="mail">
            <TextInput testID="checkin-email-input" placeholder="E-posta" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={s.fieldInput} />
          </Field>
          <Field icon="key">
            <TextInput testID="checkin-code-input" placeholder="Giriş Kodu" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="characters" value={code} onChangeText={setCode} style={[s.fieldInput, { letterSpacing: 3, fontWeight: "700" }]} maxLength={8} />
          </Field>
          <Field icon="lock-closed">
            <TextInput testID="checkin-password-input" placeholder="Yeni şifre (min 4)" placeholderTextColor={COLORS.onSurfaceTertiary} secureTextEntry value={password} onChangeText={setPassword} style={s.fieldInput} />
          </Field>
          <Field icon="lock-closed">
            <TextInput testID="checkin-confirm-input" placeholder="Şifre tekrar" placeholderTextColor={COLORS.onSurfaceTertiary} secureTextEntry value={confirm} onChangeText={setConfirm} style={s.fieldInput} />
          </Field>

          <Pressable
            testID="checkin-submit-button"
            onPress={submit}
            disabled={loading || !email.trim() || !code.trim() || !password || !confirm}
            style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }, (loading || !email.trim() || !code.trim() || !password || !confirm) && { opacity: 0.5 }]}
          >
            {loading ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Check-in & Giriş</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  return (
    <View style={s.field}>
      <Ionicons name={icon} size={18} color={COLORS.brand} style={{ marginLeft: SPACING.md }} />
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { padding: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.md },
  backBtn: { alignSelf: "flex-start", paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  back: { color: COLORS.brand, fontSize: 16 },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceSecondary, lineHeight: 19, marginBottom: SPACING.md },
  field: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  fieldInput: { flex: 1, color: COLORS.onSurface, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: 16 },
  btn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, alignItems: "center", marginTop: SPACING.md },
  btnText: { color: COLORS.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 14 },
});
