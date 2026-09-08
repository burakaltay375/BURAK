import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, RequestItem, type HotelServices } from "@/src/api";
import { useAuth } from "@/src/auth";
import HospiraBrand from "@/src/components/HospiraBrand";
import { COLORS, SPACING, RADIUS, TYPE, DEPT_LABEL, PRIORITY_COLOR, SERVICE_LABELS } from "@/src/theme";

export default function StaffQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [services, setServices] = useState<HotelServices | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const prevCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const [data, serviceData] = await Promise.all([api.deptQueue(), api.myHotelServices()]);
      // Sound/haptic if new task arrived
      if (prevCount.current && data.length > prevCount.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      prevCount.current = data.length;
      setItems(data);
      setServices(serviceData.services);
    } catch (e: any) { setErr(e.message); setItems([]); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const accept = async (id: string) => {
    setErr(null);
    setBusyId(id);
    try { await api.accept(id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusyId(null); }
  };
  const reject = async (id: string) => {
    setErr(null);
    setBusyId(id);
    try { await api.reject(id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusyId(null); }
  };

  if (items === null) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }
  const filtered = filterUrgent ? items.filter((r) => r.oncelik === "YUKSEK") : items;
  const enabledServices = Object.entries(services ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => SERVICE_LABELS[key as keyof typeof SERVICE_LABELS])
    .filter(Boolean);

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="staff-queue-screen">
      <View style={s.header}>
        <HospiraBrand compact />
        <Text style={s.title}>Bekleyen İşler</Text>
        <Text style={s.sub}>{DEPT_LABEL[user?.department ?? ""] ?? "Departman"} · {items.length} talep</Text>
        {!!enabledServices.length && (
          <View style={s.servicesRow}>
            {enabledServices.map((label) => <Text key={label} style={s.serviceChip}>{label}</Text>)}
          </View>
        )}
        {err && <Text style={s.err}>{err}</Text>}
        <View style={s.chipsRow}>
          <Pressable testID="filter-all-chip" onPress={() => setFilterUrgent(false)} style={[s.chip, !filterUrgent && s.chipActive]}>
            <Text style={[s.chipText, !filterUrgent && s.chipTextActive]}>Hepsi</Text>
          </Pressable>
          <Pressable testID="filter-urgent-chip" onPress={() => setFilterUrgent(true)} style={[s.chip, filterUrgent && s.chipActive]}>
            <Text style={[s.chipText, filterUrgent && s.chipTextActive]}>Acil</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.brand} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Kuyruk Boş</Text>
            <Text style={s.emptySub}>Yeni talepler buraya düşecek.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card} testID={`queue-card-${item.id}`}>
            <View style={s.cardTop}>
              <View style={[s.priDot, { backgroundColor: PRIORITY_COLOR[item.oncelik] }]} />
              <Text style={s.room}>Oda {item.room_no}</Text>
              <Text style={s.time}>{item.zaman}</Text>
            </View>
            <Text style={s.taskTitle}>{item.hizmet_turu}</Text>
            <Text style={s.guest}>Misafir: {item.guest_name}</Text>
            {!!item.detay && <Text style={s.detail}>{item.detay}</Text>}
            <View style={s.actions}>
              <Pressable
                testID={`reject-${item.id}`}
                onPress={() => reject(item.id)}
                disabled={busyId === item.id}
                style={[s.btn, s.btnReject]}
              >
                <Text style={s.btnRejectText}>Reddet</Text>
              </Pressable>
              <Pressable
                testID={`accept-${item.id}`}
                onPress={() => accept(item.id)}
                disabled={busyId === item.id}
                style={[s.btn, s.btnAccept]}
              >
                {busyId === item.id ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnAcceptText}>İşi Kabul Et</Text>}
              </Pressable>
            </View>
          </View>
        )}
      />
      {err && (
        <View style={s.toast} testID="queue-error">
          <Text style={s.toastText}>{err}</Text>
          <Pressable onPress={() => setErr(null)}><Text style={s.toastClose}>Kapat</Text></Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { padding: SPACING.lg, paddingBottom: SPACING.md },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary, marginTop: 4 },
  servicesRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm },
  serviceChip: { color: COLORS.brand, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.pill, overflow: "hidden", paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, fontSize: 11, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 12, marginTop: SPACING.sm },
  chipsRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  chip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary, height: 36, justifyContent: "center" },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { color: COLORS.onSurfaceSecondary, fontSize: 13 },
  chipTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  list: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  priDot: { width: 10, height: 10, borderRadius: 5 },
  room: { color: COLORS.onSurface, fontSize: 15, fontWeight: "700", flex: 1 },
  time: { color: COLORS.brand, fontSize: 13, fontWeight: "700" },
  taskTitle: { color: COLORS.onSurface, fontSize: 18, fontFamily: TYPE.display, fontWeight: "700" },
  guest: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  detail: { color: COLORS.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  btn: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center" },
  btnAccept: { backgroundColor: COLORS.brand },
  btnAcceptText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  btnReject: { backgroundColor: COLORS.surfaceTertiary, borderWidth: 1, borderColor: COLORS.border },
  btnRejectText: { color: COLORS.onSurfaceSecondary, fontWeight: "700", fontSize: 14 },
  empty: { padding: SPACING.xl2, alignItems: "center", gap: SPACING.sm },
  emptyTitle: { color: COLORS.onSurface, fontSize: 18, fontFamily: TYPE.display },
  emptySub: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  toast: { position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: COLORS.error, padding: SPACING.md, borderRadius: RADIUS.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md },
  toastText: { color: "#fff", flex: 1, fontSize: 13 },
  toastClose: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
