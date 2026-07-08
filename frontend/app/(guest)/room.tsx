import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, Reservation, ReservationStatus, Room } from "@/src/api";
import { formatTrDate } from "@/src/dates";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Beklemede",
  checked_in: "Otelde",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

const ROOM_STATUS_LABEL: Record<Room["status"], string> = {
  available: "Müsait",
  occupied: "Dolu",
  cleaning: "Temizlikte",
  maintenance: "Bakımda",
  out_of_service: "Kullanım Dışı",
};

export default function GuestRoom() {
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, res] = await Promise.all([api.myRoom(), api.myReservations()]);
    setRoom(r);
    setReservations(res);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setRoom(null);
      setReservations([]);
    });
  }, [load]));

  if (room === undefined) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="guest-room-screen">
      <View style={s.header}>
        <Text style={s.title}>Odam</Text>
        <Text style={s.sub}>Rezervasyon ve oda bilgileri</Text>
        {err && <Text style={s.err}>{err}</Text>}
      </View>
      <View style={s.card}>
        <Text style={s.label}>Oda</Text>
        <Text style={s.value}>{room ? room.room_number : "Atanmadı"}</Text>
        {room && <Text style={s.meta}>{room.type} · {ROOM_STATUS_LABEL[room.status]}</Text>}
      </View>
      {reservations.map((r) => (
        <View key={r.id} style={s.card} testID={`guest-reservation-${r.id}`}>
          <Text style={s.label}>Rezervasyon</Text>
          <Text style={s.value}>{RESERVATION_STATUS_LABEL[r.status]}</Text>
          <Text style={s.meta}>{formatTrDate(r.check_in_date)} → {formatTrDate(r.check_out_date)}</Text>
        </View>
      ))}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface, padding: SPACING.lg },
  header: { marginBottom: SPACING.lg },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  err: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, gap: SPACING.xs },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  value: { color: COLORS.brand, fontSize: 26, fontFamily: TYPE.display, fontWeight: "700" },
  meta: { color: COLORS.onSurfaceSecondary, fontSize: 13 },
});
