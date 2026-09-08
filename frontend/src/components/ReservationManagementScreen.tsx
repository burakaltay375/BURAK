import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { api, type ReservationReferral } from "@/src/api";
import HospiraBrand from "@/src/components/HospiraBrand";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function ReservationManagementScreen() {
  const [items, setItems] = useState<ReservationReferral[] | null>(null);
  const [stats, setStats] = useState<{ total_referrals: number; by_room_type: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [referrals, summary] = await Promise.all([
        api.managerReservationReferrals(),
        api.managerReservationReferralStats(),
      ]);
      setItems(referrals); setStats(summary); setError(null);
    } catch (e: any) { setItems([]); setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  if (items === null) return <SafeAreaView style={s.root}><ActivityIndicator style={{ flex: 1 }} color={COLORS.brand} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={s.content}>
        <HospiraBrand compact />
        <Text style={s.title}>Rezervasyon Trafiği</Text>
        <Text style={s.sub}>Hospira’dan otelinizin resmi rezervasyon sayfasına yapılan yönlendirmeler</Text>
        {error && <Text style={s.error}>{error}</Text>}

        <View style={s.totalCard}>
          <Text style={s.totalValue}>{stats?.total_referrals ?? 0}</Text>
          <Text style={s.totalLabel}>Toplam yönlendirme</Text>
        </View>

        {!!stats && Object.keys(stats.by_room_type).length > 0 && (
          <View style={s.types}>
            {Object.entries(stats.by_room_type).map(([type, count]) => (
              <View key={type} style={s.typeCard}>
                <Text style={s.typeCount}>{count}</Text>
                <Text style={s.typeName}>{type}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.section}>Bekleyen Talepler</Text>
        {items.map((item) => (
          <View key={item.id} style={s.card}>
            <View style={s.row}>
              <Text style={s.cardTitle}>{item.room_type} · {item.guest_count} kişi</Text>
              <Text style={s.badge}>Bekleyen Talep</Text>
            </View>
            <Text style={s.meta}>{item.check_in_date} → {item.check_out_date}</Text>
            <Text style={s.meta}>Yönlendirme: {new Date(item.created_at).toLocaleString("tr-TR")}</Text>
          </View>
        ))}
        {!items.length && <Text style={s.empty}>Henüz yönlendirme kaydı yok.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl3 },
  title: { color: COLORS.onSurface, fontFamily: TYPE.display, fontSize: 27, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 12, lineHeight: 18 },
  error: { color: COLORS.error, fontSize: 13 },
  totalCard: { backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.brand, padding: SPACING.xl },
  totalValue: { color: COLORS.brand, fontSize: 38, fontWeight: "900" },
  totalLabel: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  types: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  typeCard: { minWidth: 100, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  typeCount: { color: COLORS.brand, fontSize: 22, fontWeight: "800" },
  typeName: { color: COLORS.onSurfaceTertiary, fontSize: 11 },
  section: { color: COLORS.onSurface, fontFamily: TYPE.display, fontSize: 19, fontWeight: "700", marginTop: SPACING.sm },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm },
  cardTitle: { color: COLORS.onSurface, fontWeight: "700" },
  badge: { color: COLORS.brand, fontSize: 11, fontWeight: "700" },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", marginTop: SPACING.lg },
});
