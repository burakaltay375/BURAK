import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, RequestItem } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE, DEPT_LABEL, STATUS_LABEL, PRIORITY_COLOR } from "@/src/theme";

const STEPS = ["ALINDI", "PERSONEL_GIDIYOR", "TAMAMLANDI"] as const;

function StatusTracker({ status }: { status: string }) {
  const idx = STEPS.indexOf(status as any);
  const isRejected = status === "REDDEDILDI";
  return (
    <View style={s.tracker}>
      {STEPS.map((st, i) => {
        const active = !isRejected && i <= idx;
        return (
          <View key={st} style={s.trackerStep}>
            <View style={[s.dot, active && s.dotActive, isRejected && i === 0 && s.dotRejected]} />
            <Text style={[s.stepLabel, active && s.stepLabelActive]}>{STATUS_LABEL[st]}</Text>
            {i < STEPS.length - 1 && <View style={[s.line, active && s.lineActive]} />}
          </View>
        );
      })}
      {isRejected && <Text style={s.rejectedTag}>Reddedildi</Text>}
    </View>
  );
}

export default function GuestRequests() {
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.myRequests()); } catch { setItems([]); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  if (items === null) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="guest-requests-screen">
      <View style={s.header}>
        <Text style={s.title}>Taleplerim</Text>
        <Text style={s.sub}>Geçmiş ve aktif taleplerinizi izleyin</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.brand} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Henüz talep yok</Text>
            <Text style={s.emptySub}>Konsiyerj sekmesinden yeni talep oluşturabilirsiniz.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card} testID={`request-card-${item.id}`}>
            <View style={s.cardHeader}>
              <View style={[s.priDot, { backgroundColor: PRIORITY_COLOR[item.oncelik] }]} />
              <Text style={s.cardTitle}>{item.hizmet_turu}</Text>
              <Text style={s.cardTime}>{item.zaman}</Text>
            </View>
            <Text style={s.cardDept}>{DEPT_LABEL[item.departman]}  ·  Oda {item.room_no}</Text>
            {!!item.detay && <Text style={s.cardDetail}>{item.detay}</Text>}
            <StatusTracker status={item.status} />
            {item.assigned_staff_name && <Text style={s.staff}>Görevli: {item.assigned_staff_name}</Text>}
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
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  priDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { color: COLORS.onSurface, fontSize: 17, fontWeight: "700", flex: 1, fontFamily: TYPE.display },
  cardTime: { color: COLORS.brand, fontSize: 13, fontWeight: "700" },
  cardDept: { color: COLORS.onSurfaceTertiary, fontSize: 12, letterSpacing: 0.5 },
  cardDetail: { color: COLORS.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  tracker: { flexDirection: "row", alignItems: "center", marginTop: SPACING.sm, gap: 0 },
  trackerStep: { flexDirection: "row", alignItems: "center", flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.surfaceTertiary, borderWidth: 2, borderColor: COLORS.borderStrong },
  dotActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  dotRejected: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  line: { flex: 1, height: 2, backgroundColor: COLORS.borderStrong, marginHorizontal: 4 },
  lineActive: { backgroundColor: COLORS.brand },
  stepLabel: { position: "absolute", top: 18, left: -10, color: COLORS.onSurfaceTertiary, fontSize: 10, width: 80 },
  stepLabelActive: { color: COLORS.brand, fontWeight: "700" },
  rejectedTag: { color: COLORS.error, fontSize: 12, fontWeight: "700", marginLeft: SPACING.sm },
  staff: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: SPACING.lg, fontStyle: "italic" },
  empty: { padding: SPACING.xl2, alignItems: "center", gap: SPACING.sm },
  emptyTitle: { color: COLORS.onSurface, fontSize: 18, fontFamily: TYPE.display },
  emptySub: { color: COLORS.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
});
