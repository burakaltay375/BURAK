import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, Reservation, Room, ReservationStatus } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

type Tab = "reservations" | "rooms";

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Beklemede",
  checked_in: "Otelde",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

const STATUS_COLOR: Record<ReservationStatus, string> = {
  pending: COLORS.warning,
  checked_in: COLORS.brand,
  completed: COLORS.success,
  cancelled: COLORS.error,
};

export default function AdminReservations() {
  const [tab, setTab] = useState<Tab>("reservations");
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [newRes, setNewRes] = useState({ open: false, name: "", email: "", phone: "", room: "" });
  const [newRoom, setNewRoom] = useState({ open: false, num: "", type: "Standard" });
  const [assignRoom, setAssignRoom] = useState<{ open: boolean; res?: Reservation; value: string }>({ open: false, value: "" });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, ro] = await Promise.all([api.listReservations(), api.listRooms()]);
      setReservations(r); setRooms(ro);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);

  const createReservation = async () => {
    setErr(null); setBusy("create-res");
    try {
      await api.adminCreateReservation({
        customer_name: newRes.name.trim(),
        customer_email: newRes.email.trim(),
        customer_phone: newRes.phone.trim(),
        room_number: newRes.room.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewRes({ open: false, name: "", email: "", phone: "", room: "" });
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const createRoom = async () => {
    setErr(null); setBusy("create-room");
    try {
      await api.createRoom({ room_number: newRoom.num.trim(), type: newRoom.type });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewRoom({ open: false, num: "", type: "Standard" });
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const doAction = async (id: string, action: "approve" | "complete" | "cancel") => {
    setBusy(id);
    try {
      if (action === "approve") await api.approveCheckin(id);
      else if (action === "complete") await api.completeReservation(id);
      else await api.cancelReservation(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const assignRoomTo = async () => {
    if (!assignRoom.res || !assignRoom.value.trim()) return;
    setBusy(assignRoom.res.id);
    try {
      await api.assignRoom(assignRoom.res.id, assignRoom.value.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAssignRoom({ open: false, value: "" });
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const deleteRoom = async (id: string) => {
    setBusy(id);
    try { await api.deleteRoom(id); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  if (!reservations || !rooms) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  const availableRooms = rooms.filter((r) => r.status === "available");

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-reservations-screen">
      <View style={s.header}>
        <Text style={s.title}>{tab === "reservations" ? "Rezervasyonlar" : "Odalar"}</Text>
        <Text style={s.sub}>
          {tab === "reservations" ? `${reservations.length} kayıt` : `${rooms.length} oda · ${availableRooms.length} müsait`}
        </Text>
        <View style={s.tabsRow}>
          <Pressable testID="tab-reservations" onPress={() => setTab("reservations")} style={[s.tab, tab === "reservations" && s.tabActive]}>
            <Text style={[s.tabText, tab === "reservations" && s.tabTextActive]}>Rezervasyonlar</Text>
          </Pressable>
          <Pressable testID="tab-rooms" onPress={() => setTab("rooms")} style={[s.tab, tab === "rooms" && s.tabActive]}>
            <Text style={[s.tabText, tab === "rooms" && s.tabTextActive]}>Odalar</Text>
          </Pressable>
        </View>
      </View>

      {tab === "reservations" ? (
        <FlatList
          data={reservations}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.brand} />}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>Henüz rezervasyon yok</Text></View>}
          renderItem={({ item }) => (
            <View style={s.card} testID={`reservation-${item.id}`}>
              <View style={s.cardTop}>
                <Text style={s.name}>{item.customer_name}</Text>
                <Text style={[s.badge, { backgroundColor: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
              </View>
              <Text style={s.meta}>{item.customer_email} · {item.customer_phone}</Text>
              <View style={s.codeRow}>
                <Text style={s.codeLbl}>Kod:</Text>
                <Text style={s.codeVal} selectable>{item.access_code}</Text>
                <Text style={s.codeLbl}>Oda:</Text>
                <Text style={s.roomVal}>{item.room_number ?? "—"}</Text>
              </View>
              <View style={s.actionsRow}>
                {item.status === "pending" && (
                  <>
                    <Pressable testID={`assign-${item.id}`} onPress={() => setAssignRoom({ open: true, res: item, value: item.room_number ?? "" })} style={[s.actBtn, s.actBtnGhost]}>
                      <Ionicons name="bed" size={14} color={COLORS.onSurfaceSecondary} />
                      <Text style={s.actGhostText}>Oda Ata</Text>
                    </Pressable>
                    <Pressable testID={`approve-${item.id}`} onPress={() => doAction(item.id, "approve")} disabled={busy === item.id} style={[s.actBtn, s.actBtnPrimary]}>
                      <Text style={s.actPrimaryText}>Check-in Onayla</Text>
                    </Pressable>
                  </>
                )}
                {item.status === "checked_in" && (
                  <Pressable testID={`complete-${item.id}`} onPress={() => doAction(item.id, "complete")} disabled={busy === item.id} style={[s.actBtn, s.actBtnPrimary]}>
                    <Text style={s.actPrimaryText}>Çıkış Yap (Complete)</Text>
                  </Pressable>
                )}
                {(item.status === "pending" || item.status === "checked_in") && (
                  <Pressable testID={`cancel-${item.id}`} onPress={() => doAction(item.id, "cancel")} disabled={busy === item.id} style={[s.actBtn, s.actBtnDanger]}>
                    <Text style={s.actDangerText}>İptal</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          numColumns={2}
          columnWrapperStyle={{ gap: SPACING.md }}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>Henüz oda yok</Text></View>}
          renderItem={({ item }) => (
            <View style={s.roomCard} testID={`room-${item.id}`}>
              <View style={s.roomCardTop}>
                <Ionicons name="bed" size={20} color={item.status === "occupied" ? COLORS.warning : COLORS.success} />
                <Pressable onPress={() => deleteRoom(item.id)} disabled={busy === item.id} testID={`delete-room-${item.id}`}>
                  <Ionicons name="trash" size={16} color={COLORS.onSurfaceTertiary} />
                </Pressable>
              </View>
              <Text style={s.roomNum}>{item.room_number}</Text>
              <Text style={s.roomType}>{item.type}</Text>
              <Text style={[s.roomStatus, { color: item.status === "occupied" ? COLORS.warning : COLORS.success }]}>
                {item.status === "occupied" ? "Dolu" : "Müsait"}
              </Text>
            </View>
          )}
        />
      )}

      <Pressable
        testID="fab-add"
        onPress={() => tab === "reservations" ? setNewRes({ ...newRes, open: true }) : setNewRoom({ ...newRoom, open: true })}
        style={s.fab}
      >
        <Ionicons name="add" size={28} color={COLORS.onBrandPrimary} />
      </Pressable>

      {err && (
        <View style={s.toast}>
          <Text style={s.toastText}>{err}</Text>
          <Pressable onPress={() => setErr(null)}><Ionicons name="close" size={18} color="#fff" /></Pressable>
        </View>
      )}

      {/* New Reservation Modal */}
      <Modal visible={newRes.open} animationType="slide" transparent onRequestClose={() => setNewRes({ ...newRes, open: false })}>
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={s.modalCard} testID="new-reservation-modal">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Yeni Rezervasyon</Text>
                <Pressable onPress={() => setNewRes({ ...newRes, open: false })}><Ionicons name="close" size={22} color={COLORS.onSurfaceSecondary} /></Pressable>
              </View>
              <TextInput testID="new-res-name" placeholder="Ad Soyad" placeholderTextColor={COLORS.onSurfaceTertiary} value={newRes.name} onChangeText={(v) => setNewRes({ ...newRes, name: v })} style={s.input} />
              <TextInput testID="new-res-email" placeholder="E-posta" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" value={newRes.email} onChangeText={(v) => setNewRes({ ...newRes, email: v })} style={s.input} />
              <TextInput testID="new-res-phone" placeholder="Telefon" placeholderTextColor={COLORS.onSurfaceTertiary} keyboardType="phone-pad" value={newRes.phone} onChangeText={(v) => setNewRes({ ...newRes, phone: v })} style={s.input} />
              <TextInput testID="new-res-room" placeholder="Oda (opsiyonel)" placeholderTextColor={COLORS.onSurfaceTertiary} keyboardType="numeric" value={newRes.room} onChangeText={(v) => setNewRes({ ...newRes, room: v })} style={s.input} />
              <Pressable testID="new-res-submit" onPress={createReservation} disabled={busy === "create-res" || !newRes.name.trim() || !newRes.email.trim() || !newRes.phone.trim()} style={[s.modalBtn, (busy === "create-res" || !newRes.name.trim() || !newRes.email.trim() || !newRes.phone.trim()) && { opacity: 0.5 }]}>
                {busy === "create-res" ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.modalBtnText}>Oluştur</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Room Modal */}
      <Modal visible={newRoom.open} animationType="slide" transparent onRequestClose={() => setNewRoom({ ...newRoom, open: false })}>
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalScroll}>
            <View style={s.modalCard} testID="new-room-modal">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Yeni Oda</Text>
                <Pressable onPress={() => setNewRoom({ ...newRoom, open: false })}><Ionicons name="close" size={22} color={COLORS.onSurfaceSecondary} /></Pressable>
              </View>
              <TextInput testID="new-room-num" placeholder="Oda Numarası" placeholderTextColor={COLORS.onSurfaceTertiary} keyboardType="numeric" value={newRoom.num} onChangeText={(v) => setNewRoom({ ...newRoom, num: v })} style={s.input} />
              <View style={s.typesRow}>
                {["Standard", "Deluxe", "Suite"].map((t) => (
                  <Pressable key={t} testID={`new-room-type-${t}`} onPress={() => setNewRoom({ ...newRoom, type: t })} style={[s.typeChip, newRoom.type === t && s.typeChipActive]}>
                    <Text style={[s.typeText, newRoom.type === t && s.typeTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable testID="new-room-submit" onPress={createRoom} disabled={busy === "create-room" || !newRoom.num.trim()} style={[s.modalBtn, (busy === "create-room" || !newRoom.num.trim()) && { opacity: 0.5 }]}>
                {busy === "create-room" ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.modalBtnText}>Ekle</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Assign Room Modal */}
      <Modal visible={assignRoom.open} animationType="fade" transparent onRequestClose={() => setAssignRoom({ open: false, value: "" })}>
        <View style={s.modalBg}>
          <View style={s.modalScroll}>
            <View style={s.modalCard} testID="assign-room-modal">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Oda Ata</Text>
                <Pressable onPress={() => setAssignRoom({ open: false, value: "" })}><Ionicons name="close" size={22} color={COLORS.onSurfaceSecondary} /></Pressable>
              </View>
              <Text style={s.modalSub}>{assignRoom.res?.customer_name}</Text>
              <ScrollView style={{ maxHeight: 280 }}>
                <View style={s.roomsGrid}>
                  {availableRooms.map((r) => (
                    <Pressable
                      key={r.id}
                      testID={`pick-room-${r.room_number}`}
                      onPress={() => setAssignRoom({ ...assignRoom, value: r.room_number })}
                      style={[s.pickRoom, assignRoom.value === r.room_number && s.pickRoomActive]}
                    >
                      <Text style={[s.pickRoomNum, assignRoom.value === r.room_number && { color: COLORS.onBrandPrimary }]}>{r.room_number}</Text>
                      <Text style={[s.pickRoomType, assignRoom.value === r.room_number && { color: COLORS.onBrandPrimary }]}>{r.type}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Pressable testID="assign-room-submit" onPress={assignRoomTo} disabled={!assignRoom.value.trim()} style={[s.modalBtn, !assignRoom.value.trim() && { opacity: 0.5 }]}>
                <Text style={s.modalBtnText}>Ata</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary, marginTop: 4 },
  tabsRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  tab: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border, height: 36, justifyContent: "center" },
  tabActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  tabText: { color: COLORS.onSurfaceSecondary, fontSize: 13 },
  tabTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  list: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.md, paddingBottom: 120 },

  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: COLORS.onSurface, fontSize: 15, fontWeight: "700", flex: 1, fontFamily: TYPE.display },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.pill, fontSize: 10, fontWeight: "700", color: "#0F0F11", overflow: "hidden" },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flexWrap: "wrap", marginTop: 4 },
  codeLbl: { color: COLORS.onSurfaceTertiary, fontSize: 11 },
  codeVal: { color: COLORS.brand, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  roomVal: { color: COLORS.onSurface, fontSize: 13, fontWeight: "700" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm },
  actBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  actBtnPrimary: { backgroundColor: COLORS.brand },
  actBtnGhost: { backgroundColor: COLORS.surfaceTertiary, borderWidth: 1, borderColor: COLORS.border },
  actBtnDanger: { backgroundColor: "rgba(229,57,53,0.15)", borderWidth: 1, borderColor: COLORS.error },
  actPrimaryText: { color: COLORS.onBrandPrimary, fontSize: 12, fontWeight: "700" },
  actGhostText: { color: COLORS.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
  actDangerText: { color: COLORS.error, fontSize: 12, fontWeight: "700" },

  roomCard: { flex: 1, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: 4 },
  roomCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roomNum: { color: COLORS.onSurface, fontSize: 24, fontFamily: TYPE.display, fontWeight: "800", marginTop: SPACING.xs },
  roomType: { color: COLORS.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  roomStatus: { fontSize: 12, fontWeight: "700", marginTop: 4 },

  fab: { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center", elevation: 6 },
  empty: { padding: SPACING.xl2, alignItems: "center" },
  emptyText: { color: COLORS.onSurfaceTertiary, fontSize: 14 },

  toast: { position: "absolute", left: 16, right: 16, bottom: 100, backgroundColor: COLORS.error, padding: SPACING.md, borderRadius: RADIUS.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toastText: { color: "#fff", flex: 1, marginRight: SPACING.md, fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)" },
  modalScroll: { flexGrow: 1, justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, gap: SPACING.md },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: COLORS.onSurface, fontSize: 20, fontFamily: TYPE.display, fontWeight: "700" },
  modalSub: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  input: { backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  modalBtn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center", marginTop: SPACING.sm },
  modalBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  typesRow: { flexDirection: "row", gap: SPACING.sm },
  typeChip: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, alignItems: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  typeChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  typeText: { color: COLORS.onSurfaceSecondary, fontSize: 13 },
  typeTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  roomsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pickRoom: { width: "30%", aspectRatio: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  pickRoomActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  pickRoomNum: { color: COLORS.onSurface, fontSize: 18, fontWeight: "800", fontFamily: TYPE.display },
  pickRoomType: { color: COLORS.onSurfaceTertiary, fontSize: 10, marginTop: 2, textTransform: "uppercase" },
});
