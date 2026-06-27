import { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/auth";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1780283575089-eb917a09a5b1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBob3RlbCUyMHJlc29ydCUyMGV4dGVyaW9yJTIwbmlnaHR8ZW58MHx8fHwxNzgxODY4NjU5fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const u = await signIn(email.trim(), password);
      if (u.role === "guest") router.replace("/(guest)/chat");
      else if (u.role === "staff") router.replace("/(staff)/queue");
      else router.replace("/(admin)/dashboard");
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  const fillDemo = (which: "guest" | "staff" | "admin") => {
    if (which === "guest") { setEmail("misafir@hotel.com"); setPassword("misafir123"); }
    if (which === "staff") { setEmail("kurutemizleme@hotel.com"); setPassword("personel123"); }
    if (which === "admin") { setEmail("admin@hotel.com"); setPassword("admin123"); }
  };

  return (
    <View style={s.root} testID="login-screen">
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFillObject as any} contentFit="cover" />
      <LinearGradient
        colors={["rgba(15,15,17,0)", "rgba(15,15,17,0.6)", "rgba(15,15,17,0.96)"]}
        style={StyleSheet.absoluteFillObject as any}
      />
      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Text style={s.brandMark}>Astoria</Text>
            <Text style={s.brandSub}>Akıllı Operasyon Merkezi</Text>
          </View>

          <View style={s.form}>
            <Text style={s.title}>Hoş Geldiniz</Text>
            <Text style={s.subtitle}>Hesabınıza giriş yapın</Text>

            {err && <Text style={s.err} testID="login-error">{err}</Text>}

            <TextInput
              testID="login-email-input"
              placeholder="E-posta"
              placeholderTextColor={COLORS.onSurfaceTertiary}
              autoCapitalize="none" keyboardType="email-address"
              value={email} onChangeText={setEmail} style={s.input}
            />
            <TextInput
              testID="login-password-input"
              placeholder="Şifre"
              placeholderTextColor={COLORS.onSurfaceTertiary}
              secureTextEntry value={password} onChangeText={setPassword} style={s.input}
            />

            <Pressable testID="login-submit-button" onPress={submit} disabled={loading} style={({ pressed }) => [s.btn, pressed && s.btnPressed]}>
              {loading ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Giriş Yap</Text>}
            </Pressable>

            <View style={s.divider}><View style={s.dividerLine} /><Text style={s.dividerText}>veya</Text><View style={s.dividerLine} /></View>

            <View style={s.publicRow}>
              <Pressable testID="goto-reserve-button" onPress={() => router.push("/reserve")} style={s.publicBtn}>
                <Text style={s.publicBtnTitle}>Rezervasyon Yap</Text>
                <Text style={s.publicBtnSub}>Şifresiz · 30 saniye</Text>
              </Pressable>
              <Pressable testID="goto-checkin-button" onPress={() => router.push("/checkin")} style={s.publicBtn}>
                <Text style={s.publicBtnTitle}>Otele Giriş</Text>
                <Text style={s.publicBtnSub}>Rezervasyon kodu ile</Text>
              </Pressable>
            </View>

            <Pressable testID="goto-register-button" onPress={() => router.push("/register")} style={s.linkBtn}>
              <Text style={s.linkText}>Personel/Yönetici? Hesap oluştur</Text>
            </Pressable>

            <View style={s.demoRow}>
              <Pressable testID="demo-guest-button" onPress={() => fillDemo("guest")} style={s.demoChip}><Text style={s.demoText}>Misafir</Text></Pressable>
              <Pressable testID="demo-staff-button" onPress={() => fillDemo("staff")} style={s.demoChip}><Text style={s.demoText}>Personel</Text></Pressable>
              <Pressable testID="demo-admin-button" onPress={() => fillDemo("admin")} style={s.demoChip}><Text style={s.demoText}>Yönetici</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "flex-end", padding: SPACING.xl, paddingBottom: SPACING.xl2 },
  header: { marginBottom: SPACING.xl2 },
  brandMark: { fontSize: 42, color: COLORS.brand, fontFamily: TYPE.display, fontWeight: "700", letterSpacing: 1 },
  brandSub: { fontSize: 14, color: COLORS.onSurfaceSecondary, marginTop: SPACING.xs, letterSpacing: 2, textTransform: "uppercase" },
  form: { gap: SPACING.md },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  subtitle: { fontSize: 14, color: COLORS.onSurfaceSecondary, marginBottom: SPACING.md },
  input: {
    backgroundColor: COLORS.surfaceSecondary, color: COLORS.onSurface,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    fontSize: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  btn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, alignItems: "center", marginTop: SPACING.sm },
  btnPressed: { opacity: 0.85 },
  btnText: { color: COLORS.onBrandPrimary, fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  linkBtn: { alignItems: "center", paddingVertical: SPACING.md },
  linkText: { color: COLORS.brand, fontSize: 14 },
  err: { color: COLORS.error, fontSize: 14, textAlign: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginVertical: SPACING.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  publicRow: { flexDirection: "row", gap: SPACING.sm },
  publicBtn: { flex: 1, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.brand, alignItems: "center", gap: 4 },
  publicBtnTitle: { color: COLORS.brand, fontSize: 14, fontWeight: "700" },
  publicBtnSub: { color: COLORS.onSurfaceTertiary, fontSize: 11 },
  demoRow: { flexDirection: "row", gap: SPACING.sm, justifyContent: "center", marginTop: SPACING.md },
  demoChip: { backgroundColor: COLORS.surfaceTertiary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  demoText: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
});
