import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { api, Hotel, Role, User } from "@/src/api";
import { ROLE_LABELS } from "@/src/roles";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

type Filter = "all" | Exclude<Role, "system_admin">;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "hotel_manager", label: "Manager" },
  { key: "staff", label: "Staff" },
  { key: "guest", label: "Guest" },
];

export default function SystemUsers() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, h] = await Promise.all([api.listUsers(), api.listHotels()]);
    setUsers(u);
    setHotels(h);
    setErr(null);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setUsers([]);
      setHotels([]);
    });
  }, [load]));

  const hotelName = useMemo(() => {
    const map = new Map(hotels.map((h) => [h.id, h.hotel_name]));
    return (u: User) => map.get(u.hotel_id ?? u.hotelId ?? "") ?? "Platform";
  }, [hotels]);

  const filtered = useMemo(() => {
    if (!users) return [];
    if (filter === "all") return users;
    return users.filter((u) => u.role === filter);
  }, [filter, users]);

  if (!users) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="system-users-screen">
      <View style={s.header}>
        <Text style={s.title}>Kullanıcılar</Text>
        <Text style={s.sub}>{filtered.length} / {users.length} kullanıcı · platform kapsamı</Text>
        {err && <Text style={s.err}>{err}</Text>}
        <View style={s.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              testID={`user-filter-${f.key}`}
              onPress={() => setFilter(f.key)}
              style={[s.chip, filter === f.key && s.chipActive]}
            >
              <Text style={[s.chipText, filter === f.key && s.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Bu filtrede kullanıcı yok</Text>}
        renderItem={({ item }) => (
          <View style={s.card} testID={`system-user-${item.id}`}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.email}>{item.email}</Text>
              </View>
              <Text style={[s.badge, (item.active ?? true) ? s.active : s.inactive]}>
                {(item.active ?? true) ? "Aktif" : "Pasif"}
              </Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.meta}>{ROLE_LABELS[item.role]}</Text>
              <Text style={s.meta}>{hotelName(item)}</Text>
            </View>
            {item.department && <Text style={s.detail}>Departman: {item.department}</Text>}
            {item.role === "staff" && (
              <>
                <Text style={s.detail}>Yaş: {item.age ?? "—"} · Doğum: {item.birth_date ?? "—"}</Text>
                <Text style={s.detail}>Cinsiyet: {item.gender ?? "—"} · Uyruk: {item.nationality ?? "—"}</Text>
                <Text style={s.detail}>Konum: {[item.country, item.region_city].filter(Boolean).join(" / ") || "—"}</Text>
              </>
            )}
            {item.room_no && <Text style={s.detail}>Oda: {item.room_no}</Text>}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, gap: SPACING.md },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  err: { color: COLORS.error, fontSize: 13 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surfaceSecondary },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  chipTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  list: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.lg },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  name: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  email: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  badge: { overflow: "hidden", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  active: { backgroundColor: COLORS.success, color: COLORS.surface },
  inactive: { backgroundColor: COLORS.surfaceTertiary, color: COLORS.onSurfaceSecondary },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  meta: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
  detail: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
});
