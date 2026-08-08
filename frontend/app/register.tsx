import { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import HospiraBrand from "@/src/components/HospiraBrand";
import { dashboardRouteForRole } from "@/src/roles";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

type Role = "guest";

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<Role>("guest");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const u = await signUp({
        email: email.trim(), password, name: name.trim(), role,
      });
      router.replace(dashboardRouteForRole(u.role));
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  return (
    <View style={s.root} testID="register-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <HospiraBrand compact subtitle="Akıllı Operasyon Merkezi" />
          <Pressable onPress={() => router.back()} testID="register-back-button" style={s.backBtn}>
            <Text style={s.back}>‹ Geri</Text>
          </Pressable>
          <Text style={s.title}>Kayıt Ol</Text>
          <Text style={s.subtitle}>Hesabınızı oluşturun</Text>

          <View style={s.rolesRow}>
            <Pressable
              testID="register-role-guest"
              onPress={() => setRole("guest")}
              style={[s.roleChip, s.roleChipActive]}
            >
              <Text style={[s.roleText, s.roleTextActive]}>Misafir</Text>
            </Pressable>
          </View>

          {err && <Text style={s.err} testID="register-error">{err}</Text>}

          <TextInput testID="register-name-input" placeholder="Adınız" placeholderTextColor={COLORS.onSurfaceTertiary} value={name} onChangeText={setName} style={s.input} />
          <TextInput testID="register-email-input" placeholder="E-posta" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={s.input} />
          <TextInput testID="register-password-input" placeholder="Şifre" placeholderTextColor={COLORS.onSurfaceTertiary} secureTextEntry value={password} onChangeText={setPassword} style={s.input} />

          <Pressable testID="register-submit-button" onPress={submit} disabled={loading} style={({ pressed }) => [s.btn, pressed && s.btnPressed]}>
            {loading ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Kayıt Ol</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { padding: SPACING.xl, paddingTop: SPACING.xl2 + SPACING.xl, gap: SPACING.md },
  backBtn: { alignSelf: "flex-start", paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  back: { color: COLORS.brand, fontSize: 16 },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  subtitle: { fontSize: 14, color: COLORS.onSurfaceSecondary, marginBottom: SPACING.md },
  rolesRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  roleChip: { flex: 1, paddingVertical: SPACING.md, alignItems: "center", borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  roleChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  roleText: { color: COLORS.onSurfaceSecondary, fontSize: 14 },
  roleTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  input: { backgroundColor: COLORS.surfaceSecondary, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  btn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, alignItems: "center", marginTop: SPACING.md },
  btnPressed: { opacity: 0.85 },
  btnText: { color: COLORS.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 14 },
});
