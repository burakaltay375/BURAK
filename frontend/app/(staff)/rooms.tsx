import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, Room } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const STATUS_LABEL: Record<Room["status"], string> = {
  available: "Boş",
  reserved: "Rezerve",
  occupied: "Dolu",
  cleaning: "Temizlikte",
  maintenance: "Bakımda",
};

export default function StaffRooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRooms(await api.staffRooms());
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setRooms([]);
    });
  }, [load]));

  if (!rooms) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="staff-rooms-screen">
      <View style={s.header}>
        <Text style={s.title}>Odalar</Text>
        <Text style={s.sub}>{rooms.length} oda · sadece görüntüleme</Text>
        {err && <Text style={s.err}>{err}</Text>}
      </View>
      <FlatList
        data={rooms}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <View style={s.card} testID={`staff-room-${item.id}`}>
            <View style={s.cardTop}>
              <Text style={s.room}>Oda {item.room_number}</Text>
              <Text style={s.status}>{STATUS_LABEL[item.status]}</Text>
            </View>
            <Text style={s.type}>{item.room_name || item.room_type} · Kat {item.floor || "—"} · {item.capacity} kişi</Text>
            <Text style={s.type}>₺{Math.round(item.price_per_night).toLocaleString("tr-TR")} / Gece</Text>
            {!!item.current_guest_name && <Text style={s.guest}>Misafir: {item.current_guest_name}</Text>}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  err: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },
  list: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  room: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  status: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
  type: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  guest: { color: COLORS.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
});
