import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, Room, RoomInput, RoomType } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

const ROOM_TYPES: RoomType[] = ["Standard", "Deluxe", "Suite", "Family", "VIP"];
const CAPACITIES = [1, 2, 3, 4];

const STATUS_LABEL: Record<Room["status"], string> = {
  available: "Boş",
  reserved: "Rezerve",
  occupied: "Dolu",
  cleaning: "Temizlikte",
  maintenance: "Bakımda",
};

const STATUS_TONE: Record<Room["status"], { color: string; bg: string }> = {
  available: { color: COLORS.success, bg: "rgba(76,175,80,0.14)" },
  reserved: { color: COLORS.error, bg: "rgba(229,57,53,0.14)" },
  occupied: { color: COLORS.error, bg: "rgba(229,57,53,0.18)" },
  cleaning: { color: COLORS.onSurface, bg: "rgba(245,245,245,0.14)" },
  maintenance: { color: COLORS.onSurfaceTertiary, bg: "#050506" },
};

const EMPTY_FORM: RoomInput = {
  room_number: "",
  room_name: "",
  room_type: "Standard",
  floor: "",
  capacity: 2,
  price_per_night: 0,
  is_active: true,
  description: "",
};

function money(value: number) {
  return `₺${Math.round(value || 0).toLocaleString("tr-TR")}`;
}

function formFromRoom(room: Room): RoomInput {
  return {
    room_number: room.room_number,
    room_name: room.room_name ?? "",
    room_type: room.room_type,
    floor: room.floor ?? "",
    capacity: room.capacity,
    price_per_night: room.price_per_night,
    is_active: room.is_active,
    description: room.description ?? "",
  };
}

export default function AdminRooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing?: Room | null }>({ open: false });
  const [form, setForm] = useState<RoomInput>(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      setRooms(await api.listRooms());
    } catch (e: any) {
      setErr(e.message);
      setRooms([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ open: true });
  };

  const openEdit = (room: Room) => {
    setForm(formFromRoom(room));
    setModal({ open: true, editing: room });
  };

  const save = async () => {
    setErr(null);
    if (!form.room_number.trim()) { setErr("Oda numarası gerekli"); return; }
    if (!form.price_per_night || form.price_per_night < 0) { setErr("Geçerli fiyat girin"); return; }
    setBusy("save-room");
    try {
      const payload: RoomInput = {
        ...form,
        room_number: form.room_number.trim(),
        room_name: form.room_name?.trim() || null,
        floor: form.floor?.trim() || null,
        description: form.description?.trim() || null,
      };
      if (modal.editing) await api.updateRoom(modal.editing.id, payload);
      else await api.createRoom(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal({ open: false });
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (room: Room) => {
    setBusy(room.id);
    try {
      await api.deleteRoom(room.id);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!rooms) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-rooms-screen">
      <View style={s.header}>
        <Text style={s.title}>Oda Yönetimi</Text>
        <Text style={s.sub}>{rooms.length} oda · {rooms.filter((r) => r.is_active).length} aktif</Text>
        {err && <Text style={s.err}>{err}</Text>}
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.brand} />}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>Henüz oda yok</Text></View>}
        renderItem={({ item }) => (
          <View style={s.card} testID={`manager-room-${item.id}`}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.roomNum}>{item.room_name || item.room_number}</Text>
                <Text style={s.meta}>{item.room_number} · {item.room_type} · Kat {item.floor || "—"}</Text>
              </View>
              <Text style={[s.status, item.is_active ? { color: STATUS_TONE[item.status].color, backgroundColor: STATUS_TONE[item.status].bg } : s.inactive]}>{item.is_active ? STATUS_LABEL[item.status] : "Pasif"}</Text>
            </View>
            <View style={s.details}>
              <Pill icon="people" text={`${item.capacity} kişi`} />
              <Pill icon="cash" text={`${money(item.price_per_night)} / Gece`} />
              <Pill icon="sparkles" text="Durum otomatik" />
            </View>
            {!!item.description && <Text style={s.description}>{item.description}</Text>}
            <View style={s.actions}>
              <Pressable onPress={() => openEdit(item)} style={s.ghostBtn} testID={`edit-room-${item.id}`}>
                <Ionicons name="create" size={15} color={COLORS.onSurfaceSecondary} />
                <Text style={s.ghostText}>Düzenle</Text>
              </Pressable>
              <Pressable onPress={() => remove(item)} disabled={busy === item.id} style={s.deleteBtn} testID={`delete-room-${item.id}`}>
                <Ionicons name="trash" size={15} color={COLORS.error} />
                <Text style={s.deleteText}>Sil</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Pressable testID="add-room-button" onPress={openCreate} style={s.fab}>
        <Ionicons name="add" size={28} color={COLORS.onBrandPrimary} />
      </Pressable>

      <Modal visible={modal.open} animationType="slide" transparent onRequestClose={() => setModal({ open: false })}>
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={s.modalCard} testID="room-form-modal">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{modal.editing ? "Odayı Düzenle" : "Yeni Oda"}</Text>
                <Pressable onPress={() => setModal({ open: false })}><Ionicons name="close" size={22} color={COLORS.onSurfaceSecondary} /></Pressable>
              </View>
              <TextInput testID="room-number-input" placeholder="Oda numarası veya adı (101, 201 Deluxe)" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.room_number} onChangeText={(v) => setForm({ ...form, room_number: v })} style={s.input} />
              <TextInput testID="room-name-input" placeholder="Oda ismi (opsiyonel)" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.room_name ?? ""} onChangeText={(v) => setForm({ ...form, room_name: v })} style={s.input} />
              <View style={s.chips}>
                {ROOM_TYPES.map((type) => (
                  <Pressable key={type} onPress={() => setForm({ ...form, room_type: type })} style={[s.chip, form.room_type === type && s.chipActive]}>
                    <Text style={[s.chipText, form.room_type === type && s.chipTextActive]}>{type}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.row}>
                <TextInput testID="room-floor-input" placeholder="Kat" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.floor ?? ""} onChangeText={(v) => setForm({ ...form, floor: v })} style={[s.input, { flex: 1 }]} />
                <TextInput testID="room-price-input" placeholder="Gecelik fiyat" placeholderTextColor={COLORS.onSurfaceTertiary} keyboardType="numeric" value={String(form.price_per_night || "")} onChangeText={(v) => setForm({ ...form, price_per_night: Number(v.replace(/[^\d.]/g, "")) || 0 })} style={[s.input, { flex: 2 }]} />
              </View>
              <Text style={s.label}>Kapasite</Text>
              <View style={s.chips}>
                {CAPACITIES.map((capacity) => (
                  <Pressable key={capacity} onPress={() => setForm({ ...form, capacity })} style={[s.chip, form.capacity === capacity && s.chipActive]}>
                    <Text style={[s.chipText, form.capacity === capacity && s.chipTextActive]}>{capacity} kişi</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.autoNote}>Oda durumu otomatik hesaplanır: boşsa yeşil, misafir check-in varsa kırmızı, housekeeping çağrısı varsa beyaz görünür.</Text>
              <Pressable onPress={() => setForm({ ...form, is_active: !form.is_active })} style={[s.activeToggle, form.is_active && s.activeToggleOn]}>
                <Text style={[s.activeText, form.is_active && s.activeTextOn]}>{form.is_active ? "Aktif" : "Pasif"}</Text>
              </Pressable>
              <TextInput testID="room-description-input" placeholder="Açıklama" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.description ?? ""} onChangeText={(v) => setForm({ ...form, description: v })} multiline style={[s.input, s.textarea]} />
              <Pressable onPress={save} disabled={busy === "save-room"} style={[s.saveBtn, busy === "save-room" && { opacity: 0.6 }]}>
                {busy === "save-room" ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.saveText}>{modal.editing ? "Kaydet" : "Oda Oluştur"}</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Pill({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.pill}>
      <Ionicons name={icon} size={12} color={COLORS.onSurfaceTertiary} />
      <Text style={s.pillText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  err: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },
  list: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.md, paddingBottom: 120 },
  empty: { padding: SPACING.xl2, alignItems: "center" },
  emptyText: { color: COLORS.onSurfaceTertiary },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.sm },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: SPACING.md },
  roomNum: { color: COLORS.onSurface, fontSize: 22, fontFamily: TYPE.display, fontWeight: "800" },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  status: { color: COLORS.success, fontSize: 12, fontWeight: "800", backgroundColor: "rgba(76,175,80,0.14)", paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.pill },
  inactive: { color: COLORS.onSurfaceTertiary, backgroundColor: COLORS.surfaceTertiary },
  details: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 6 },
  pillText: { color: COLORS.onSurfaceSecondary, fontSize: 11, fontWeight: "600" },
  description: { color: COLORS.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: 2 },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceTertiary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill },
  ghostText: { color: COLORS.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.error, backgroundColor: "rgba(229,57,53,0.12)", paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill },
  deleteText: { color: COLORS.error, fontSize: 12, fontWeight: "700" },
  fab: { position: "absolute", right: 24, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center", elevation: 6 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)" },
  modalScroll: { flexGrow: 1, justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, gap: SPACING.md },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: COLORS.onSurface, fontSize: 20, fontFamily: TYPE.display, fontWeight: "700" },
  input: { backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  textarea: { minHeight: 82, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: SPACING.sm },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  autoNote: { color: COLORS.onSurfaceTertiary, fontSize: 12, lineHeight: 17, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { color: COLORS.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: COLORS.onBrandPrimary },
  activeToggle: { padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center" },
  activeToggleOn: { backgroundColor: "rgba(76,175,80,0.14)", borderColor: COLORS.success },
  activeText: { color: COLORS.onSurfaceTertiary, fontWeight: "700" },
  activeTextOn: { color: COLORS.success },
  saveBtn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center", marginTop: SPACING.sm },
  saveText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: 15 },
});
