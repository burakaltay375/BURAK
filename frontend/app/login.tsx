import { useEffect, useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, type Hotel } from "@/src/api";
import { useAuth } from "@/src/auth";
import { dashboardRouteForRole } from "@/src/roles";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1780283575089-eb917a09a5b1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBob3RlbCUyMHJlc29ydCUyMGV4dGVyaW9yJTIwbmlnaHR8ZW58MHx8fHwxNzgxODY4NjU5fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();

  useEffect(() => {
    if (!authLoading && user) router.replace(dashboardRouteForRole(user.role));
  }, [user, authLoading, router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [hotelsLoading, setHotelsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setHotelsLoading(true);
      try {
        const activeHotels = await api.activeHotels();
        if (!alive) return;
        setHotels(activeHotels);
        setSelectedHotelId((prev) => prev ?? activeHotels[0]?.id ?? null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Aktif oteller yüklenemedi");
      } finally {
        if (alive) setHotelsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const submit = async () => {
    if (!selectedHotelId) {
      setErr("Lütfen bir otel seçin");
      return;
    }
    setErr(null); setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const u = await signIn(email.trim(), password, selectedHotelId);
      router.replace(dashboardRouteForRole(u.role));
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  const fillDemo = (which: "guest" | "staff" | "admin") => {
    if (which === "guest") { setEmail("misafir@hotel.com"); setPassword("misafir123"); }
    if (which === "staff") { setEmail("kurutemizleme@hotel.com"); setPassword("personel123"); }
    if (which === "admin") { setEmail("manager@hotel.com"); setPassword("manager123"); }
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

            <View style={s.hotelsSection}>
              <Text style={s.hotelsTitle}>Anlaşmalı Oteller</Text>
              {hotelsLoading ? (
                <ActivityIndicator color={COLORS.brand} />
              ) : hotels.length === 0 ? (
                <Text style={s.hotelEmptyText}>Aktif anlaşmalı otel bulunamadı.</Text>
              ) : (
                <View style={s.hotelsRow}>
                  {hotels.map((hotel) => {
                    const selected = selectedHotelId === hotel.id;
                    return (
                      <Pressable
                        key={hotel.id}
                        testID={`hotel-option-${hotel.id}`}
                        onPress={() => setSelectedHotelId(hotel.id)}
                        style={[s.hotelChip, selected && s.hotelChipSelected]}
                      >
                        <Text style={[s.hotelChipText, selected && s.hotelChipTextSelected]}>
                          {hotel.hotel_name}
                        </Text>
                        <Text style={[s.hotelCityText, selected && s.hotelChipTextSelected]}>
                          {hotel.city}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

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

            <Pressable testID="login-submit-button" onPress={submit} disabled={loading || hotelsLoading || !selectedHotelId} style={({ pressed }) => [s.btn, pressed && s.btnPressed]}>
              {loading ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Giriş Yap</Text>}
            </Pressable>

            <View style={s.divider}><View style={s.dividerLine} /><Text style={s.dividerText}>veya</Text><View style={s.dividerLine} /></View>

            <View style={s.publicRow}>
              <Pressable testID="goto-checkin-button" onPress={() => router.push("/checkin")} style={s.publicBtn}>
                <Text style={s.publicBtnTitle}>Otele Giriş</Text>
                <Text style={s.publicBtnSub}>Giriş kodu ile hesabınızı aktive edin</Text>
              </Pressable>
            </View>

            <Pressable testID="goto-register-button" onPress={() => router.push("/register")} style={s.linkBtn}>
              <Text style={s.linkText}>Misafir hesabı oluştur</Text>
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
  hotelsSection: { gap: SPACING.sm },
  hotelsTitle: { color: COLORS.onSurfaceSecondary, fontSize: 13, letterSpacing: 0.3 },
  hotelsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  hotelChip: {
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: 120,
    gap: 2,
  },
  hotelChipSelected: {
    borderColor: COLORS.brand,
    backgroundColor: COLORS.surfaceTertiary,
  },
  hotelChipText: { color: COLORS.onSurface, fontSize: 13, fontWeight: "700" },
  hotelCityText: { color: COLORS.onSurfaceTertiary, fontSize: 11 },
  hotelChipTextSelected: { color: COLORS.brand },
  hotelEmptyText: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
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
