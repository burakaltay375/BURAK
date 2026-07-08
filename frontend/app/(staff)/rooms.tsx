import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, Room } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const STATUS: Room["status"][] = ["available", "occupied", "cleaning", "maintenance", "out_of_service"];

export default function StaffRooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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

  const update = async (room: Room, status: Room["status"]) => {
    setBusy(room.id);
    try {
      await api.updateRoomStatus(room.id, status);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!rooms) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="staff-rooms-screen">
      <View style={s.header}>
        <Text style={s.title}>Odalar</Text>
        <Text style={s.sub}>{rooms.length} oda · durum güncelle</Text>
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
              <Text style={s.status}>{item.status}</Text>
            </View>
            <Text style={s.type}>{item.type}</Text>
            <View style={s.chips}>
              {STATUS.map((st) => (
                <Pressable key={st} disabled={busy === item.id} onPress={() => update(item, st)} style={[s.chip, item.status === st && s.chipActive]}>
                  <Text style={[s.chipText, item.status === st && s.chipTextActive]}>{st}</Text>
                </Pressable>
              ))}
            </View>
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { color: COLORS.onSurfaceSecondary, fontSize: 11 },
  chipTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
});
