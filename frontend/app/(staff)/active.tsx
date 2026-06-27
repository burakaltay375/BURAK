import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, RequestItem } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE, PRIORITY_COLOR } from "@/src/theme";

export default function StaffActive() {
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.activeJobs()); } catch { setItems([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const id = setInterval(load, 6000); return () => clearInterval(id); }, [load]);

  const complete = async (id: string) => {
    setBusyId(id);
    try { await api.complete(id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await load(); }
    finally { setBusyId(null); }
  };

  if (items === null) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="staff-active-screen">
      <View style={s.header}>
        <Text style={s.title}>Aktif İşler</Text>
        <Text style={s.sub}>Yürütülmekte olan görevler</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}><Text style={s.emptyTitle}>Aktif iş yok</Text><Text style={s.emptySub}>Kuyruktan iş kabul ettiğinizde burada görünür.</Text></View>
        }
        renderItem={({ item }) => (
          <View style={s.card} testID={`active-card-${item.id}`}>
            <View style={s.cardTop}>
              <View style={[s.priDot, { backgroundColor: PRIORITY_COLOR[item.oncelik] }]} />
              <Text style={s.room}>Oda {item.room_no}</Text>
              <Text style={s.time}>{item.zaman}</Text>
            </View>
            <Text style={s.taskTitle}>{item.hizmet_turu}</Text>
            <Text style={s.guest}>Misafir: {item.guest_name}</Text>
            {!!item.detay && <Text style={s.detail}>{item.detay}</Text>}
            <Pressable
              testID={`complete-${item.id}`}
              onPress={() => complete(item.id)}
              disabled={busyId === item.id}
              style={[s.btn, s.btnComplete]}
            >
              {busyId === item.id ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Tamamla</Text>}
            </Pressable>
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
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary, marginTop: 4 },
  list: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.brand },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  priDot: { width: 10, height: 10, borderRadius: 5 },
  room: { color: COLORS.onSurface, fontSize: 15, fontWeight: "700", flex: 1 },
  time: { color: COLORS.brand, fontSize: 13, fontWeight: "700" },
  taskTitle: { color: COLORS.onSurface, fontSize: 18, fontFamily: TYPE.display, fontWeight: "700" },
  guest: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  detail: { color: COLORS.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  btn: { paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center", marginTop: SPACING.sm },
  btnComplete: { backgroundColor: COLORS.success },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  empty: { padding: SPACING.xl2, alignItems: "center", gap: SPACING.sm },
  emptyTitle: { color: COLORS.onSurface, fontSize: 18, fontFamily: TYPE.display },
  emptySub: { color: COLORS.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
});
