import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, IdentityAlert, Reservation, Room, ReservationStatus } from "@/src/api";
import { autoFormatDate, isValidISODate, formatTrDate, nightsBetween } from "@/src/dates";
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

const ROOM_STATUS_LABEL: Record<Room["status"], string> = {
  available: "Müsait",
  reserved: "Rezerve",
  occupied: "Dolu",
  cleaning: "Temizlikte",
  maintenance: "Bakımda",
};

const ROOM_STATUS_COLOR: Record<Room["status"], string> = {
  available: COLORS.success,
  reserved: COLORS.error,
  occupied: COLORS.error,
  cleaning: COLORS.onSurfaceTertiary,
  maintenance: COLORS.info,
};

export default function AdminReservations() {
  const [tab, setTab] = useState<Tab>("reservations");
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [identityAlerts, setIdentityAlerts] = useState<IdentityAlert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const emptyNewRes = { open: false, name: "", email: "", phone: "", room: "", roomId: "", capacity: 2, checkIn: "", checkOut: "", identityRequested: false, memberNames: ["", "", "", ""] };
  const [newRes, setNewRes] = useState(emptyNewRes);
  const [newRoom, setNewRoom] = useState({ open: false, num: "", type: "Standard" });
  const [assignRoom, setAssignRoom] = useState<{ open: boolean; res?: Reservation; value: string }>({ open: false, value: "" });
  const [modalRooms, setModalRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, ro, alerts] = await Promise.all([api.listReservations(), api.listRooms(), api.managerIdentityAlerts()]);
      setReservations(r); setRooms(ro);
      setIdentityAlerts(alerts);
    } catch (e: any) {
      setErr(e.message);
      setReservations([]);
      setRooms([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);
  useEffect(() => {
    let cancelled = false;
    setNewRes((current) => ({ ...current, room: "", roomId: "" }));
    setModalRooms([]);
    if (!newRes.open || !isValidISODate(newRes.checkIn) || !isValidISODate(newRes.checkOut) || (nightsBetween(newRes.checkIn, newRes.checkOut) ?? 0) < 1) return;
    setRoomsLoading(true);
    api.adminAvailableRooms({ check_in_date: newRes.checkIn, check_out_date: newRes.checkOut, capacity: newRes.capacity })
      .then((data) => { if (!cancelled) setModalRooms(data); })
      .catch((e: any) => { if (!cancelled) { setErr(e.message); setModalRooms([]); } })
      .finally(() => { if (!cancelled) setRoomsLoading(false); });
    return () => { cancelled = true; };
  }, [newRes.open, newRes.checkIn, newRes.checkOut, newRes.capacity]);
  useEffect(() => {
    let cancelled = false;
    if (!assignRoom.open || !assignRoom.res?.check_in_date || !assignRoom.res?.check_out_date) return;
    setRoomsLoading(true);
    api.adminAvailableRooms({
      check_in_date: assignRoom.res.check_in_date,
      check_out_date: assignRoom.res.check_out_date,
      capacity: assignRoom.res.capacity || 1,
    })
      .then((data) => {
        if (!cancelled) {
          const currentRoom = rooms?.find((r) => r.room_number === assignRoom.res?.room_number);
          setModalRooms(currentRoom && !data.some((r) => r.id === currentRoom.id) ? [currentRoom, ...data] : data);
        }
      })
      .catch((e: any) => { if (!cancelled) { setErr(e.message); setModalRooms([]); } })
      .finally(() => { if (!cancelled) setRoomsLoading(false); });
    return () => { cancelled = true; };
  }, [assignRoom.open, assignRoom.res, rooms]);

  const createReservation = async () => {
    setErr(null);
    if (!isValidISODate(newRes.checkIn) || !isValidISODate(newRes.checkOut)) {
      setErr("Tarihler YYYY-AA-GG formatında olmalı"); return;
    }
    if ((nightsBetween(newRes.checkIn, newRes.checkOut) ?? 0) < 1) {
      setErr("Çıkış tarihi giriş tarihinden sonra olmalı"); return;
    }
    setBusy("create-res");
    try {
      const identityMembers = [
        { relation: "Misafir", name: newRes.name.trim() },
        { relation: "Eş", name: newRes.memberNames[1]?.trim() || "" },
        { relation: "Çocuk 1", name: newRes.memberNames[2]?.trim() || "" },
        { relation: "Çocuk 2", name: newRes.memberNames[3]?.trim() || "" },
      ].slice(0, newRes.capacity).filter((m) => m.name);
      await api.adminCreateReservation({
        customer_name: newRes.name.trim(),
        customer_email: newRes.email.trim(),
        customer_phone: newRes.phone.trim(),
        check_in_date: newRes.checkIn,
        check_out_date: newRes.checkOut,
        capacity: newRes.capacity,
        room_id: newRes.roomId || undefined,
        room_number: newRes.room || undefined,
        identity_verification_requested: newRes.identityRequested,
        identity_members: newRes.identityRequested ? identityMembers : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewRes(emptyNewRes);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const createRoom = async () => {
    setErr(null); setBusy("create-room");
    try {
      await api.createRoom({
        room_number: newRoom.num.trim(),
        room_type: newRoom.type as Room["room_type"],
        capacity: 2,
        price_per_night: 0,
        is_active: true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewRoom({ open: false, num: "", type: "Standard" });
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const doAction = async (id: string, action: "approve" | "complete" | "cancel" | "identity-approve" | "identity-reject") => {
    setBusy(id);
    try {
      if (action === "approve") await api.approveCheckin(id);
      else if (action === "complete") await api.completeReservation(id);
      else if (action === "identity-approve") await api.approveReservationIdentity(id);
      else if (action === "identity-reject") await api.rejectReservationIdentity(id, "Manager kimlik doğrulamayı başarısız işaretledi");
      else await api.cancelReservation(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const assignRoomTo = async () => {
    if (!assignRoom.res || !assignRoom.value.trim()) return;
    setBusy(assignRoom.res.id);
    try {
      const room = rooms?.find((r) => r.room_number === assignRoom.value.trim());
      await api.assignRoom(assignRoom.res.id, assignRoom.value.trim(), room?.id);
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
  const identityAttentionCount = reservations.filter((r) => ["waiting_for_verification", "partially_verified", "verification_failed", "pending_review", "failed"].includes(r.identity_status)).length;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-reservations-screen">
      <View style={s.header}>
        <Text style={s.title}>{tab === "reservations" ? "Rezervasyonlar" : "Odalar"}</Text>
        <Text style={s.sub}>
          {tab === "reservations" ? `${reservations.length} kayıt${identityAttentionCount ? ` · ${identityAttentionCount} kimlik bildirimi` : ""}` : `${rooms.length} oda · ${availableRooms.length} müsait`}
        </Text>
        {tab === "reservations" && identityAlerts.length > 0 && (
          <View style={s.alertBanner}>
            <Ionicons name="notifications" size={16} color={COLORS.warning} />
            <Text style={s.alertText}>{identityAlerts[0].title}: {identityAlerts[0].detail}</Text>
          </View>
        )}
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
              <View style={s.datesRow}>
                <Ionicons name="calendar" size={12} color={COLORS.onSurfaceTertiary} />
                <Text style={s.datesText}>
                  {formatTrDate(item.check_in_date)} → {formatTrDate(item.check_out_date)}
                  {nightsBetween(item.check_in_date, item.check_out_date) !== null && ` · ${nightsBetween(item.check_in_date, item.check_out_date)} gece`}
                </Text>
                {item.email_sent && <Text style={s.emailBadge}>✉ gönderildi</Text>}
              </View>
              <View style={s.codeRow}>
                <Text style={s.codeLbl}>Kod:</Text>
                <Text style={s.codeVal} selectable>{item.access_code}</Text>
                <Text style={s.codeLbl}>Oda:</Text>
                <Text style={s.roomVal}>{item.room_number ?? "—"}</Text>
              </View>
              {item.identity_verification_requested && (
                <View style={[s.identityCard, (item.identity_status === "verification_failed" || item.identity_status === "failed") && s.identityCardDanger, (item.identity_status === "fully_verified" || item.identity_status === "verified_by_hotel") && s.identityCardOk]}>
                  <View style={s.identityTop}>
                    <Ionicons
                      name={(item.identity_status === "fully_verified" || item.identity_status === "verified_by_hotel") ? "checkmark-circle" : (item.identity_status === "verification_failed" || item.identity_status === "failed") ? "alert-circle" : "time"}
                      size={16}
                      color={(item.identity_status === "fully_verified" || item.identity_status === "verified_by_hotel") ? COLORS.success : (item.identity_status === "verification_failed" || item.identity_status === "failed") ? COLORS.error : COLORS.warning}
                    />
                    <Text style={s.identityText}>
                      Kimlik: {(item.identity_status === "fully_verified" || item.identity_status === "verified_by_hotel") ? "Fully Verified · Entry Code Generated" : (item.identity_status === "verification_failed" || item.identity_status === "failed") ? "Verification Failed" : item.identity_status === "partially_verified" ? "Partially Verified" : "Waiting For Verification"}
                    </Text>
                  </View>
                  {!!item.identity_members?.length && <Text style={s.identityMeta}>{item.identity_members.map((m) => `${m.relation}: ${m.name} (${m.status})`).join(" · ")}</Text>}
                  {item.identity_failure_reason && <Text style={s.identityErr}>{item.identity_failure_reason}</Text>}
                  {["waiting_for_verification", "partially_verified", "pending_review"].includes(item.identity_status) && (
                    <View style={s.actionsRow}>
                      <Pressable testID={`identity-approve-${item.id}`} onPress={() => doAction(item.id, "identity-approve")} disabled={busy === item.id} style={[s.actBtn, s.actBtnPrimary]}>
                        <Text style={s.actPrimaryText}>Kimliği Onayla ✓</Text>
                      </Pressable>
                      <Pressable testID={`identity-reject-${item.id}`} onPress={() => doAction(item.id, "identity-reject")} disabled={busy === item.id} style={[s.actBtn, s.actBtnDanger]}>
                        <Text style={s.actDangerText}>Kimlik Başarısız</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
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
              <Text style={[s.roomStatus, { color: ROOM_STATUS_COLOR[item.status] }]}>
                {ROOM_STATUS_LABEL[item.status]}
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
              <View style={s.modalDatesRow}>
                <TextInput
                  testID="new-res-checkin"
                  placeholder="Giriş YYYY-AA-GG"
                  placeholderTextColor={COLORS.onSurfaceTertiary}
                  keyboardType="number-pad"
                  value={newRes.checkIn}
                  onChangeText={(v) => setNewRes({ ...newRes, checkIn: autoFormatDate(v) })}
                  maxLength={10}
                  style={[s.input, { flex: 1 }, !!newRes.checkIn && !isValidISODate(newRes.checkIn) && { borderColor: COLORS.error }]}
                />
                <TextInput
                  testID="new-res-checkout"
                  placeholder="Çıkış YYYY-AA-GG"
                  placeholderTextColor={COLORS.onSurfaceTertiary}
                  keyboardType="number-pad"
                  value={newRes.checkOut}
                  onChangeText={(v) => setNewRes({ ...newRes, checkOut: autoFormatDate(v) })}
                  maxLength={10}
                  style={[s.input, { flex: 1 }, !!newRes.checkOut && !isValidISODate(newRes.checkOut) && { borderColor: COLORS.error }]}
                />
              </View>
              <Text style={s.modalSub}>Kişi Sayısı</Text>
              <View style={s.typesRow}>
                {[1, 2, 3, 4].map((capacity) => (
                  <Pressable key={capacity} onPress={() => setNewRes({ ...newRes, capacity })} style={[s.typeChip, newRes.capacity === capacity && s.typeChipActive]}>
                    <Text style={[s.typeText, newRes.capacity === capacity && s.typeTextActive]}>{capacity}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setNewRes({ ...newRes, identityRequested: !newRes.identityRequested })} style={s.identityToggle} testID="new-res-identity-toggle">
                <Ionicons name={newRes.identityRequested ? "checkbox" : "square-outline"} size={22} color={newRes.identityRequested ? COLORS.brand : COLORS.onSurfaceTertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.identityText}>Kimlik doğrulamasını başlat</Text>
                  <Text style={s.identityMeta}>Misafir, eş ve çocuklar için doğrulama kaydı açılır; başarılı olursa kod aktif olur.</Text>
                </View>
              </Pressable>
              {newRes.identityRequested && (
                <View style={s.identityBox}>
                  <Text style={s.modalSub}>Doğrulanacak Kişiler</Text>
                  <Text style={s.identityMeta}>Misafir: {newRes.name.trim() || "Ad Soyad alanı kullanılacak"}</Text>
                  {newRes.capacity >= 2 && <TextInput placeholder="Eş adı soyadı" placeholderTextColor={COLORS.onSurfaceTertiary} value={newRes.memberNames[1]} onChangeText={(v) => setNewRes((r) => { const memberNames = [...r.memberNames]; memberNames[1] = v; return { ...r, memberNames }; })} style={s.input} />}
                  {newRes.capacity >= 3 && <TextInput placeholder="Çocuk 1 adı soyadı" placeholderTextColor={COLORS.onSurfaceTertiary} value={newRes.memberNames[2]} onChangeText={(v) => setNewRes((r) => { const memberNames = [...r.memberNames]; memberNames[2] = v; return { ...r, memberNames }; })} style={s.input} />}
                  {newRes.capacity >= 4 && <TextInput placeholder="Çocuk 2 adı soyadı" placeholderTextColor={COLORS.onSurfaceTertiary} value={newRes.memberNames[3]} onChangeText={(v) => setNewRes((r) => { const memberNames = [...r.memberNames]; memberNames[3] = v; return { ...r, memberNames }; })} style={s.input} />}
                </View>
              )}
              {isValidISODate(newRes.checkIn) && isValidISODate(newRes.checkOut) && (nightsBetween(newRes.checkIn, newRes.checkOut) ?? 0) > 0 && (
                <>
                  <Text style={s.modalSub}>Uygun Oda Seçin</Text>
                  {roomsLoading ? <ActivityIndicator color={COLORS.brand} /> : (
                    <ScrollView style={{ maxHeight: 240 }}>
                      <View style={s.roomsGrid}>
                        {modalRooms.map((r) => (
                          <Pressable
                            key={r.id}
                            testID={`new-res-room-${r.room_number}`}
                            onPress={() => setNewRes({ ...newRes, room: r.room_number, roomId: r.id })}
                            style={[s.pickRoom, newRes.roomId === r.id && s.pickRoomActive]}
                          >
                            <Text style={[s.pickRoomNum, newRes.roomId === r.id && { color: COLORS.onBrandPrimary }]}>{r.room_number}</Text>
                            <Text style={[s.pickRoomType, newRes.roomId === r.id && { color: COLORS.onBrandPrimary }]}>{r.room_type}</Text>
                            <Text style={[s.pickRoomType, newRes.roomId === r.id && { color: COLORS.onBrandPrimary }]}>₺{Math.round(r.price_per_night).toLocaleString("tr-TR")}</Text>
                          </Pressable>
                        ))}
                        {!roomsLoading && modalRooms.length === 0 && <Text style={s.emptyText}>Uygun oda yok</Text>}
                      </View>
                    </ScrollView>
                  )}
                </>
              )}
              <Pressable
                testID="new-res-submit"
                onPress={createReservation}
                disabled={busy === "create-res" || !newRes.name.trim() || !newRes.email.trim() || !newRes.phone.trim() || !isValidISODate(newRes.checkIn) || !isValidISODate(newRes.checkOut) || !newRes.roomId}
                style={[s.modalBtn, (busy === "create-res" || !newRes.name.trim() || !newRes.email.trim() || !newRes.phone.trim() || !isValidISODate(newRes.checkIn) || !isValidISODate(newRes.checkOut) || !newRes.roomId) && { opacity: 0.5 }]}
              >
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
                  {(assignRoom.open ? modalRooms : availableRooms).map((r) => (
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
  alertBanner: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.warning, backgroundColor: "rgba(255,152,0,0.12)", borderRadius: RADIUS.md, padding: SPACING.sm },
  alertText: { color: COLORS.onSurface, fontSize: 12, lineHeight: 18, flex: 1 },
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
  datesRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, flexWrap: "wrap" },
  datesText: { color: COLORS.onSurfaceSecondary, fontSize: 12, flex: 1 },
  emailBadge: { color: COLORS.success, fontSize: 10, fontWeight: "700", backgroundColor: "rgba(76,175,80,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm },
  modalDatesRow: { flexDirection: "row", gap: SPACING.sm },
  codeRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flexWrap: "wrap", marginTop: 4 },
  codeLbl: { color: COLORS.onSurfaceTertiary, fontSize: 11 },
  codeVal: { color: COLORS.brand, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  roomVal: { color: COLORS.onSurface, fontSize: 13, fontWeight: "700" },
  identityCard: { borderWidth: 1, borderColor: COLORS.warning, backgroundColor: "rgba(255,152,0,0.10)", borderRadius: RADIUS.md, padding: SPACING.sm, gap: SPACING.xs },
  identityCardDanger: { borderColor: COLORS.error, backgroundColor: "rgba(229,57,53,0.12)" },
  identityCardOk: { borderColor: COLORS.success, backgroundColor: "rgba(76,175,80,0.12)" },
  identityTop: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  identityToggle: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md },
  identityBox: { gap: SPACING.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md },
  identityText: { color: COLORS.onSurface, fontSize: 12, fontWeight: "800" },
  identityMeta: { color: COLORS.onSurfaceTertiary, fontSize: 11, lineHeight: 16 },
  identityErr: { color: COLORS.error, fontSize: 11, fontWeight: "700" },
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
