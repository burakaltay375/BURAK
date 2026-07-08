import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, Platform,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { api, RequestItem } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE, PRIORITY_COLOR } from "@/src/theme";

export default function StaffActive() {
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proofModal, setProofModal] = useState<{ open: boolean; item?: RequestItem; photo?: string }>({ open: false });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.activeJobs()); } catch { setItems([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const id = setInterval(load, 6000); return () => clearInterval(id); }, [load]);

  const ensureCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS === "web") return true;
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) {
      setSubmitError("Kamera izni reddedilmiş. Lütfen Ayarlar'dan izin verin.");
      return false;
    }
    const req = await ImagePicker.requestCameraPermissionsAsync();
    return req.granted;
  };

  const openProofFlow = async (item: RequestItem) => {
    setSubmitError(null);
    const ok = await ensureCameraPermission();
    if (!ok) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.back,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const base64 = asset.base64;
      if (!base64) {
        setSubmitError("Fotoğraf alınamadı, lütfen tekrar deneyin.");
        return;
      }
      const dataUri = `data:image/jpeg;base64,${base64}`;
      setProofModal({ open: true, item, photo: dataUri });
    } catch (e: any) {
      setSubmitError(e.message ?? "Kamera açılamadı");
    }
  };

  const confirmSubmit = async () => {
    if (!proofModal.item || !proofModal.photo) return;
    const id = proofModal.item.id;
    setBusyId(id);
    setSubmitError(null);
    try {
      await api.complete(id, proofModal.photo);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProofModal({ open: false });
      await load();
    } catch (e: any) {
      setSubmitError(e.message ?? "Tamamlama başarısız");
    } finally {
      setBusyId(null);
    }
  };

  if (items === null) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="staff-active-screen">
      <View style={s.header}>
        <Text style={s.title}>Aktif İşler</Text>
        <Text style={s.sub}>Tamamlamadan önce kanıt fotoğrafı çekin</Text>
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
              onPress={() => openProofFlow(item)}
              disabled={busyId === item.id}
              style={({ pressed }) => [s.btn, s.btnComplete, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="camera" size={18} color={COLORS.onBrandPrimary} />
              <Text style={s.btnText}>Fotoğraf Çek & Tamamla</Text>
            </Pressable>
          </View>
        )}
      />

      {submitError && (
        <View style={s.toast} testID="active-error">
          <Text style={s.toastText}>{submitError}</Text>
          <Pressable onPress={() => setSubmitError(null)}><Ionicons name="close" size={18} color="#fff" /></Pressable>
        </View>
      )}

      <Modal visible={proofModal.open} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.modalCard} testID="proof-confirm-modal">
            <Text style={s.modalTitle}>Kanıt Önizleme</Text>
            <Text style={s.modalSub}>Bu fotoğrafı onaylayıp işi tamamlamak istiyor musunuz?</Text>
            {proofModal.photo && (
              <Image source={{ uri: proofModal.photo }} style={s.preview} contentFit="cover" />
            )}
            <View style={s.modalActions}>
              <Pressable
                testID="proof-cancel"
                onPress={() => setProofModal({ open: false })}
                style={[s.modalBtn, s.modalBtnGhost]}
                disabled={busyId !== null}
              >
                <Text style={s.modalBtnGhostText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                testID="proof-confirm"
                onPress={confirmSubmit}
                style={[s.modalBtn, s.modalBtnPrimary]}
                disabled={busyId !== null}
              >
                {busyId ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.modalBtnText}>Onayla & Gönder</Text>}
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
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.sm },
  btnComplete: { backgroundColor: COLORS.brand },
  btnText: { color: COLORS.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  empty: { padding: SPACING.xl2, alignItems: "center", gap: SPACING.sm },
  emptyTitle: { color: COLORS.onSurface, fontSize: 18, fontFamily: TYPE.display },
  emptySub: { color: COLORS.onSurfaceTertiary, fontSize: 13, textAlign: "center" },

  toast: { position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: COLORS.error, padding: SPACING.md, borderRadius: RADIUS.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toastText: { color: "#fff", flex: 1, marginRight: SPACING.md, fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: SPACING.lg },
  modalCard: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  modalTitle: { color: COLORS.onSurface, fontSize: 20, fontWeight: "700", fontFamily: TYPE.display },
  modalSub: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  modalActions: { flexDirection: "row", gap: SPACING.sm },
  modalBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  modalBtnPrimary: { backgroundColor: COLORS.brand },
  modalBtnGhost: { backgroundColor: COLORS.surfaceTertiary, borderWidth: 1, borderColor: COLORS.border },
  modalBtnText: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  modalBtnGhostText: { color: COLORS.onSurfaceSecondary, fontWeight: "700" },
});
