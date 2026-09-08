import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Modal, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, RequestItem } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE, DEPT_LABEL, STATUS_LABEL, PRIORITY_COLOR } from "@/src/theme";

export default function AdminAll() {
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [proofItem, setProofItem] = useState<RequestItem | null>(null);
  const load = useCallback(async () => { try { setItems(await api.adminAll()); } catch { setItems([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  if (!items) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  const withProof = items.filter((i) => i.proof_photo).length;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-requests-screen">
      <View style={s.header}>
        <Text style={s.title}>Tüm Talepler</Text>
        <Text style={s.sub}>{items.length} kayıt · {withProof} kanıtlı tamamlanan</Text>
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
            {item.operational_note && (
              <Text style={s.note}>Operasyon notu: {item.operational_note}</Text>
            )}

            {item.proof_photo ? (
              <Pressable
                testID={`proof-view-${item.id}`}
                onPress={() => setProofItem(item)}
                style={s.proofRow}
              >
                <Image source={{ uri: item.proof_photo }} style={s.thumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={s.proofLabel}>Kanıt Fotoğrafı</Text>
                  <Text style={s.proofHint}>Büyütmek için dokunun</Text>
                </View>
                <Ionicons name="expand" size={18} color={COLORS.brand} />
              </Pressable>
            ) : item.status === "TAMAMLANDI" ? (
              <Text style={s.noProof}>⚠ Bu kayıt için kanıt fotoğrafı yok</Text>
            ) : null}
          </View>
        )}
      />

      <Modal visible={!!proofItem} animationType="fade" transparent onRequestClose={() => setProofItem(null)}>
        <View style={s.modalBg}>
          <Pressable style={s.closeBtn} onPress={() => setProofItem(null)} testID="proof-modal-close">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <ScrollView contentContainerStyle={s.modalScroll}>
            {proofItem?.proof_photo && (
              <Image source={{ uri: proofItem.proof_photo }} style={s.fullImage} contentFit="contain" />
            )}
            <View style={s.modalFooter}>
              <Text style={s.modalTitle}>{proofItem?.hizmet_turu}</Text>
              <Text style={s.modalMeta}>{proofItem && DEPT_LABEL[proofItem.departman]} · Oda {proofItem?.room_no}</Text>
              {proofItem?.completed_at && (
                <Text style={s.modalMeta}>Tamamlanma: {new Date(proofItem.completed_at).toLocaleString("tr-TR")}</Text>
              )}
              {proofItem?.assigned_staff_name && <Text style={s.modalMeta}>Görevli: {proofItem.assigned_staff_name}</Text>}
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  note: { color: COLORS.warning, fontSize: 12, marginTop: SPACING.xs },
  proofRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, marginTop: SPACING.sm, padding: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.brand },
  thumb: { width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceTertiary },
  proofLabel: { color: COLORS.brand, fontSize: 13, fontWeight: "700" },
  proofHint: { color: COLORS.onSurfaceTertiary, fontSize: 11 },
  noProof: { color: COLORS.warning, fontSize: 12, marginTop: SPACING.sm, fontStyle: "italic" },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)" },
  closeBtn: { position: "absolute", top: 48, right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  modalScroll: { flexGrow: 1, justifyContent: "center" },
  fullImage: { width: "100%", aspectRatio: 3 / 4, alignSelf: "center" },
  modalFooter: { padding: SPACING.lg, gap: 4 },
  modalTitle: { color: "#fff", fontSize: 20, fontFamily: TYPE.display, fontWeight: "700" },
  modalMeta: { color: "#bbb", fontSize: 13 },
});
