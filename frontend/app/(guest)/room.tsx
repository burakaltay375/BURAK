import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, Room } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const ROOM_STATUS_LABEL: Record<Room["status"], string> = {
  available: "Boş",
  reserved: "Rezerve",
  occupied: "Dolu",
  cleaning: "Temizlikte",
  maintenance: "Bakımda",
};

export default function GuestRoom() {
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.myRoom();
    setRoom(r);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setRoom(null);
    });
  }, [load]));

  if (room === undefined) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="guest-room-screen">
      <View style={s.header}>
        <Text style={s.title}>Odam</Text>
        <Text style={s.sub}>Oda bilgileriniz</Text>
        {err && <Text style={s.err}>{err}</Text>}
      </View>
      <View style={s.card}>
        <Text style={s.label}>Oda</Text>
        <Text style={s.value}>{room ? (room.room_name || room.room_number) : "Atanmadı"}</Text>
        {room && <Text style={s.meta}>{room.room_type} · Kat {room.floor || "—"} · {room.capacity} kişi · {ROOM_STATUS_LABEL[room.status]}</Text>}
        {room && <Text style={s.meta}>₺{Math.round(room.price_per_night).toLocaleString("tr-TR")} / Gece</Text>}
      </View>
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
