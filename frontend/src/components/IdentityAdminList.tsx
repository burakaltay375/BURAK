import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, IdentityVerification } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";
import { IdentityStatusBadge } from "./IdentityVerificationPanel";

export function IdentityAdminList({ scope }: { scope: "manager" | "system" }) {
  const [items, setItems] = useState<IdentityVerification[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(scope === "manager" ? await api.managerIdentity() : await api.systemIdentity());
      setErr(null);
    } catch (e: any) {
      setItems([]);
      setErr(e.message);
    }
  }, [scope]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (id: string, action: "approve" | "reject" | "request" | "activate" | "ocr" | "face" | "fraud") => {
    setBusy(`${id}:${action}`);
    setErr(null);
    try {
      if (action === "approve") await api.approveIdentity(id, "Yönetici onayı");
      if (action === "reject") await api.rejectIdentity(id, "Yönetici reddi");
      if (action === "request") await api.requestIdentityDocuments(id, "Tekrar belge isteniyor");
      if (action === "activate") await api.activateEmployeeIdentity(id, "Aktif çalışan yapıldı");
      if (action === "ocr") await api.runIdentityOcr(id);
      if (action === "face") await api.runIdentityFaceComparison(id);
      if (action === "fraud") await api.runIdentityFraudAnalysis(id);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!items) return <ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} />;

  return (
    <View style={s.wrap}>
      {err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Doğrulama kaydı yok</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.top}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.user_name || item.user_email || item.user_id}</Text>
                <Text style={s.meta}>{item.subject_type === "employee" ? "Çalışan" : "Misafir"} · {item.role} · {item.hotel_id}</Text>
              </View>
              <IdentityStatusBadge status={item.status} />
            </View>
            <Text style={s.detail}>Ad Soyad: {[item.first_name, item.last_name].filter(Boolean).join(" ") || "—"}</Text>
            <Text style={s.detail}>Uyruk: {item.nationality || "—"} · Belge: {item.document_type || "—"} · No: {item.masked_document_number || "—"}</Text>
            {item.subject_type === "employee" && <Text style={s.detail}>Rol: {item.employee_role || "—"} · Başlangıç: {item.employment_start_date || "—"}</Text>}
            <Text style={s.detail}>Belgeler: {item.documents.length}</Text>
            <Text style={s.detail}>Confidence: {item.confidence_score ?? "—"}/100 · Risk: {item.fraud_risk ?? "unknown"}</Text>
            {!!item.latest_ocr?.mismatches?.length && <Text style={s.warn}>OCR uyuşmazlıkları: {item.latest_ocr.mismatches.join(", ")}</Text>}
            {!!item.latest_fraud?.duplicate_hits?.length && <Text style={s.warn}>Duplicate: {item.latest_fraud.duplicate_hits.join(", ")}</Text>}
            {!!item.latest_fraud?.signals?.length && <Text style={s.detail}>Sinyaller: {item.latest_fraud.signals.join(", ")}</Text>}
            <View style={s.actions}>
              <Button label="OCR" disabled={!!busy} onPress={() => act(item.id, "ocr")} />
              <Button label="Face" disabled={!!busy} onPress={() => act(item.id, "face")} />
              <Button label="Fraud" disabled={!!busy} onPress={() => act(item.id, "fraud")} />
            </View>
            <View style={s.actions}>
              <Button label="Onayla" disabled={!!busy} onPress={() => act(item.id, "approve")} />
              <Button label="Reddet" danger disabled={!!busy} onPress={() => act(item.id, "reject")} />
              <Button label="Belge İste" disabled={!!busy} onPress={() => act(item.id, "request")} />
              {item.subject_type === "employee" && <Button label="Aktif Çalışan" disabled={!!busy} onPress={() => act(item.id, "activate")} />}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function Button({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.btn, danger && s.btnDanger, disabled && { opacity: 0.5 }]}>
      <Text style={[s.btnText, danger && s.btnDangerText]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 120 },
  card: { backgroundColor: COLORS.surfaceSecondary, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm },
  top: { flexDirection: "row", gap: SPACING.md, alignItems: "flex-start" },
  name: { color: COLORS.onSurface, fontSize: 18, fontFamily: TYPE.display, fontWeight: "800" },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 3 },
  detail: { color: COLORS.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  warn: { color: COLORS.warning ?? COLORS.brand, fontSize: 12, fontWeight: "800", lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm },
  btn: { borderRadius: RADIUS.pill, backgroundColor: COLORS.brand, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  btnText: { color: COLORS.onBrandPrimary, fontWeight: "900", fontSize: 12 },
  btnDanger: { backgroundColor: "rgba(229,57,53,0.14)", borderWidth: 1, borderColor: COLORS.error },
  btnDangerText: { color: COLORS.error },
  err: { color: COLORS.error, paddingHorizontal: SPACING.lg, fontWeight: "700" },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.lg },
});
