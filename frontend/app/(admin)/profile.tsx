import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type Hotel, type HotelServices } from "@/src/api";
import { useAuth } from "@/src/auth";
import { COLORS, RADIUS, SERVICE_LABELS, SPACING, TYPE } from "@/src/theme";

const SERVICE_ENTRIES = Object.entries(SERVICE_LABELS);

export default function AdminProfile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const h = await api.managerHotel();
    setHotel(h);
    setErr(null);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setHotel(null);
    });
  }, [load]));

  const toggleService = async (key: string) => {
    if (!hotel) return;
    setBusy(key);
    setErr(null);
    try {
      const services: HotelServices = { ...(hotel.services ?? {}), [key]: !(hotel.services?.[key] ?? true) };
      setHotel({ ...hotel, services });
      const updated = await api.updateManagerHotel({ services });
      setHotel(updated);
    } catch (e: any) {
      setErr(e.message);
      await load().catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  if (!user) return null;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-profile-screen">
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Profil</Text>
        <View style={s.card}>
          <View style={s.avatar}><Ionicons name="person" size={36} color={COLORS.brand} /></View>
          <Text style={s.name}>{user.name}</Text>
          <Text style={s.email}>{user.email}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Otel Servisleri</Text>
          <Text style={s.sub}>{hotel ? `${hotel.hotel_name} · ${hotel.city}` : "Otel yükleniyor"}</Text>
          {err && <Text style={s.err}>{err}</Text>}
          {!hotel ? (
            <ActivityIndicator color={COLORS.brand} />
          ) : (
            <View style={s.services}>
              {SERVICE_ENTRIES.map(([key, label]) => {
                const enabled = hotel.services?.[key] ?? true;
                return (
                  <Pressable
                    key={key}
                    testID={`manager-service-${key}`}
                    onPress={() => toggleService(key)}
                    disabled={busy === key}
                    style={[s.serviceRow, enabled && s.serviceRowActive]}
                  >
                    <Text style={[s.serviceText, enabled && s.serviceTextActive]}>{label}</Text>
                    <Ionicons name={enabled ? "checkbox" : "square-outline"} size={22} color={enabled ? COLORS.brand : COLORS.onSurfaceTertiary} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Pressable testID="logout-button" onPress={logout} style={s.logout}>
          <Ionicons name="log-out" size={20} color={COLORS.error} />
          <Text style={s.logoutText}>Çıkış Yap</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xl2 },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: COLORS.onSurface, fontSize: 20, fontWeight: "700", fontFamily: TYPE.display, marginTop: SPACING.sm },
  email: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  section: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { color: COLORS.onSurface, fontSize: 18, fontWeight: "700", fontFamily: TYPE.display },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  err: { color: COLORS.error, fontSize: 13 },
  services: { gap: SPACING.sm },
  serviceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  serviceRowActive: { borderColor: COLORS.brand },
  serviceText: { color: COLORS.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  serviceTextActive: { color: COLORS.onSurface },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, padding: SPACING.lg, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.error },
  logoutText: { color: COLORS.error, fontSize: 15, fontWeight: "700" },
});
