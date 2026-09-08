import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { api, Hotel, Reservation, ReservationStatus } from "@/src/api";
import { formatTrDate } from "@/src/dates";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Beklemede",
  checked_in: "Otelde",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

export default function SystemReservations() {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, h] = await Promise.all([api.listReservations(), api.listHotels()]);
    setReservations(r);
    setHotels(h);
    setErr(null);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setReservations([]);
      setHotels([]);
    });
  }, [load]));

  const hotelName = useMemo(() => {
    const map = new Map(hotels.map((h) => [h.id, h.hotel_name]));
    return (id?: string | null) => map.get(id ?? "") ?? "Otel bilinmiyor";
  }, [hotels]);

  if (!reservations) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="system-reservations-screen">
      <View style={s.header}>
        <Text style={s.title}>Rezervasyonlar</Text>
        <Text style={s.sub}>{reservations.length} kayıt · tüm oteller</Text>
        {err && <Text style={s.err}>{err}</Text>}
      </View>
      <FlatList
        data={reservations}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Henüz rezervasyon yok</Text>}
        renderItem={({ item }) => (
          <View style={s.card} testID={`system-reservation-${item.id}`}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.customer_name}</Text>
                <Text style={s.meta}>{item.customer_email} · {item.customer_phone}</Text>
              </View>
              <Text style={[s.badge, statusStyle(item.status)]}>{STATUS_LABEL[item.status]}</Text>
            </View>
            <Text style={s.detail}>{hotelName(item.hotel_id)} · Oda {item.room_number ?? "Atanmadı"}</Text>
            <Text style={s.detail}>{formatTrDate(item.check_in_date)} → {formatTrDate(item.check_out_date)}</Text>
            <Text style={s.code}>Kod: {item.access_code}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function statusStyle(status: ReservationStatus) {
  if (status === "checked_in") return { backgroundColor: COLORS.brand, color: COLORS.onBrandPrimary } as const;
  if (status === "completed") return { backgroundColor: COLORS.success, color: COLORS.surface } as const;
  if (status === "cancelled") return { backgroundColor: COLORS.error, color: "#fff" } as const;
  return { backgroundColor: COLORS.warning, color: COLORS.surface } as const;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, gap: SPACING.sm },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  err: { color: COLORS.error, fontSize: 13 },
  list: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.lg },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  name: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  badge: { overflow: "hidden", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  detail: { color: COLORS.onSurfaceSecondary, fontSize: 13 },
  code: { color: COLORS.brand, fontSize: 13, fontWeight: "800", letterSpacing: 1 },
});
