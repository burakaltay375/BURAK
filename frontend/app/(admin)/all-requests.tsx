import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, RequestItem } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE, DEPT_LABEL, STATUS_LABEL, PRIORITY_COLOR } from "@/src/theme";

export default function AdminAll() {
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const load = useCallback(async () => { try { setItems(await api.adminAll()); } catch { setItems([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  if (!items) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-requests-screen">
      <View style={s.header}>
        <Text style={s.title}>Tüm Talepler</Text>
        <Text style={s.sub}>{items.length} kayıt</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <View style={s.card} testID={`admin-req-${item.id}`}>
            <View style={s.row}>
              <View style={[s.priDot, { backgroundColor: PRIORITY_COLOR[item.oncelik] }]} />
              <Text style={s.title2}>{item.hizmet_turu}</Text>
              <Text style={[s.badge, statusStyle(item.status)]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
            </View>
            <Text style={s.meta}>{DEPT_LABEL[item.departman]} · Oda {item.room_no} · {item.zaman}</Text>
            <Text style={s.guest}>Misafir: {item.guest_name}</Text>
            {item.assigned_staff_name && <Text style={s.staff}>Görevli: {item.assigned_staff_name}</Text>}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function statusStyle(st: string) {
  if (st === "TAMAMLANDI") return { backgroundColor: COLORS.success, color: "#fff" } as const;
  if (st === "PERSONEL_GIDIYOR") return { backgroundColor: COLORS.brand, color: COLORS.onBrandPrimary } as const;
  if (st === "REDDEDILDI") return { backgroundColor: COLORS.error, color: "#fff" } as const;
  return { backgroundColor: COLORS.surfaceTertiary, color: COLORS.onSurfaceSecondary } as const;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary, marginTop: 4 },
  list: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  priDot: { width: 10, height: 10, borderRadius: 5 },
  title2: { color: COLORS.onSurface, fontSize: 15, fontWeight: "700", flex: 1 },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.pill, fontSize: 10, fontWeight: "700", overflow: "hidden" },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  guest: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  staff: { color: COLORS.brand, fontSize: 12, fontStyle: "italic" },
});
