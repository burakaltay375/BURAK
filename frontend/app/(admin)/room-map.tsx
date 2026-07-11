import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Room } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const STATUS_LABEL: Record<Room["status"], string> = {
  available: "Boş",
  reserved: "Rezerve",
  occupied: "Dolu",
  cleaning: "Temizlikte",
  maintenance: "Bakımda",
};

const STATUS_STYLE: Record<Room["status"], { bg: string; border: string; text: string }> = {
  available: { bg: "rgba(76,175,80,0.16)", border: COLORS.success, text: COLORS.success },
  reserved: { bg: "rgba(229,57,53,0.16)", border: COLORS.error, text: COLORS.error },
  occupied: { bg: "rgba(229,57,53,0.22)", border: COLORS.error, text: COLORS.error },
  cleaning: { bg: "rgba(245,245,245,0.12)", border: COLORS.onSurfaceTertiary, text: COLORS.onSurface },
  maintenance: { bg: "#050506", border: COLORS.borderStrong, text: COLORS.onSurfaceTertiary },
};

function money(value: number) {
  return `₺${Math.round(value || 0).toLocaleString("tr-TR")}`;
}

export default function AdminRoomMap() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRooms(await api.listRooms());
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
      setRooms([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const stats = useMemo(() => {
    const counts: Record<Room["status"], number> = { available: 0, reserved: 0, occupied: 0, cleaning: 0, maintenance: 0 };
    (rooms ?? []).forEach((room) => { counts[room.status] += 1; });
    return counts;
  }, [rooms]);

  if (!rooms) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-room-map-screen">
      <View style={s.header}>
        <Text style={s.title}>Oda Haritası</Text>
        <Text style={s.sub}>{rooms.length} oda · {stats.available} boş · {stats.occupied + stats.reserved} dolu/rezerve</Text>
        {err && <Text style={s.err}>{err}</Text>}
        <View style={s.legend}>
          {(Object.keys(STATUS_LABEL) as Room["status"][]).map((status) => (
            <View key={status} style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: STATUS_STYLE[status].text }]} />
              <Text style={s.legendText}>{STATUS_LABEL[status]}</Text>
            </View>
          ))}
        </View>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: SPACING.md }}
        contentContainerStyle={s.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.brand} />}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>Haritada gösterilecek oda yok</Text></View>}
        renderItem={({ item }) => {
          const tone = STATUS_STYLE[item.status];
          return (
            <View style={[s.card, { backgroundColor: tone.bg, borderColor: tone.border }]} testID={`room-map-card-${item.id}`}>
              <View style={s.cardTop}>
                <Ionicons name="bed" size={18} color={tone.text} />
                <Text style={[s.status, { color: tone.text }]}>{STATUS_LABEL[item.status]}</Text>
              </View>
              <Text style={s.room}>{item.room_name || item.room_number}</Text>
              <Text style={s.meta}>{item.room_type} · Kat {item.floor || "—"}</Text>
              <Text style={s.meta}>{item.capacity} kişi · {money(item.price_per_night)}</Text>
              {!!item.current_guest_name && <Text style={s.guest}>Misafir: {item.current_guest_name}</Text>}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  err: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  grid: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  empty: { padding: SPACING.xl2, alignItems: "center" },
  emptyText: { color: COLORS.onSurfaceTertiary },
  card: { flex: 1, minHeight: 150, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, gap: 5 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { fontSize: 11, fontWeight: "900" },
  room: { color: COLORS.onSurface, fontSize: 24, fontFamily: TYPE.display, fontWeight: "900", marginTop: SPACING.sm },
  meta: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  guest: { color: COLORS.onSurface, fontSize: 12, fontWeight: "700", marginTop: SPACING.sm },
});
