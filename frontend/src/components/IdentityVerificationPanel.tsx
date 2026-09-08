import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, IdentityDocumentType, IdentityProfileInput, IdentityVerification, LivenessChallenge } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export const IDENTITY_STATUS_LABEL: Record<string, string> = {
  unverified: "Doğrulanmadı",
  pending: "Beklemede",
  verified: "Doğrulandı",
  rejected: "Reddedildi",
  expired: "Süresi Doldu",
  application_received: "Başvuru Alındı",
  identity_required: "Kimlik Bekleniyor",
  in_review: "İnceleniyor",
  approved: "Onaylandı",
  active_employee: "Aktif Çalışan",
  not_started: "Başlatılmadı",
  pending_review: "İnceleme Bekliyor",
  verified_by_hotel: "Hotel Tarafından Doğrulandı",
  needs_review: "Manuel İnceleme Gerekli",
  needs_new_documents: "Yeni Belge Gerekli",
  suspicious: "Şüpheli",
};

const DOCUMENT_TYPES: { type: IdentityDocumentType; label: string }[] = [
  { type: "id_front", label: "Kimlik Ön" },
  { type: "id_back", label: "Kimlik Arka" },
  { type: "passport", label: "Pasaport" },
];

const ACTION_LABEL: Record<string, string> = {
  turn_left: "Başınızı sola çevirin",
  turn_right: "Başınızı sağa çevirin",
  look_up: "Yukarı bakın",
  look_down: "Aşağı bakın",
  blink: "Göz kırpın",
  smile: "Gülümseyin",
};

export function IdentityStatusBadge({ status }: { status: string }) {
  const ok = ["verified", "approved", "active_employee", "verified_by_hotel"].includes(status);
  const bad = status === "rejected" || status === "expired" || status === "suspicious";
  return (
    <Text style={[s.badge, ok ? s.badgeOk : bad ? s.badgeBad : s.badgeWarn]}>
      {IDENTITY_STATUS_LABEL[status] ?? status}
    </Text>
  );
}

export function IdentityVerificationPanel({ identity, onChange }: { identity: IdentityVerification; onChange: (next: IdentityVerification) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [form, setForm] = useState<IdentityProfileInput>({
    first_name: identity.first_name ?? "",
    last_name: identity.last_name ?? "",
    birth_date: identity.birth_date ?? "",
    nationality: identity.nationality ?? "",
    document_type: identity.document_type ?? "TC Kimlik",
    document_number: "",
    document_expiry_date: identity.document_expiry_date ?? "",
    employee_role: identity.employee_role ?? "",
    employment_start_date: identity.employment_start_date ?? "",
    manager_approved: identity.manager_approved ?? false,
    internal_notes: identity.internal_notes ?? "",
  });

  const documentMap = useMemo(() => new Set(identity.documents.map((d) => d.document_type)), [identity.documents]);
  const readOnly = ["verified", "approved", "active_employee", "verified_by_hotel"].includes(identity.status);

  const save = async () => {
    setBusy("save");
    setErr(null);
    try {
      const next = await api.saveMyIdentity(form);
      onChange(next);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const upload = async (document_type: IdentityDocumentType) => {
    setBusy(document_type);
    setErr(null);
    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Galeri izni gerekli");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.65,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || "image/jpeg";
      const base64 = asset.base64;
      if (!base64) throw new Error("Belge base64 olarak okunamadı");
      await api.uploadIdentityDocument(identity.id, {
        document_type,
        file_name: asset.fileName || `${document_type}.jpg`,
        mime_type: mime,
        data_uri: `data:${mime};base64,${base64}`,
      });
      onChange(await api.myIdentity());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const startLiveness = async () => {
    setBusy("challenge");
    setErr(null);
    try {
      setChallenge(await api.livenessChallenge());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const uploadSelfie = async () => {
    if (!challenge) {
      await startLiveness();
      return;
    }
    setBusy("selfie");
    setErr(null);
    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Kamera izni gerekli");
      }
      const result = Platform.OS === "web"
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 })
        : await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || "image/jpeg";
      if (!asset.base64) throw new Error("Selfie base64 olarak okunamadı");
      await api.uploadIdentitySelfie(identity.id, {
        file_name: asset.fileName || "selfie.jpg",
        mime_type: mime,
        data_uri: `data:${mime};base64,${asset.base64}`,
        completed_actions: challenge.actions,
        challenge_id: challenge.id,
      });
      setChallenge(null);
      onChange(await api.myIdentity());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <View style={s.topRow}>
          <Text style={s.cardTitle}>Kimlik Doğrulama</Text>
          <IdentityStatusBadge status={identity.status} />
        </View>
        <Text style={s.help}>Kimlik bilgileriniz KVKK ilkeleri gözetilerek şifreli saklanır. Belge numarası yöneticilere maskeli gösterilir.</Text>
        <Text style={s.help}>Bu analiz resmi KYC doğrulaması değildir; OCR, kalite, liveness ve fraud sinyalleri yalnızca hotel yetkilisinin incelemesine yardımcı olur.</Text>
        {identity.masked_document_number && <Text style={s.masked}>Belge No: {identity.masked_document_number}</Text>}
        {(identity.confidence_score !== null && identity.confidence_score !== undefined) && (
          <Text style={s.masked}>Confidence: {identity.confidence_score}/100 · Risk: {identity.fraud_risk ?? "unknown"}</Text>
        )}
        {err && <Text style={s.err}>{err}</Text>}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Bilgiler</Text>
        <Input label="Ad" value={form.first_name} onChangeText={(first_name) => setForm((f) => ({ ...f, first_name }))} editable={!readOnly} />
        <Input label="Soyad" value={form.last_name} onChangeText={(last_name) => setForm((f) => ({ ...f, last_name }))} editable={!readOnly} />
        <Input label="Doğum Tarihi (YYYY-MM-DD)" value={form.birth_date} onChangeText={(birth_date) => setForm((f) => ({ ...f, birth_date }))} editable={!readOnly} />
        <Input label="Uyruk" value={form.nationality} onChangeText={(nationality) => setForm((f) => ({ ...f, nationality }))} editable={!readOnly} />
        <Input label="Belge Türü" value={form.document_type} onChangeText={(document_type) => setForm((f) => ({ ...f, document_type }))} editable={!readOnly} />
        <Input label="Kimlik / Pasaport Numarası" value={form.document_number} onChangeText={(document_number) => setForm((f) => ({ ...f, document_number }))} editable={!readOnly} secureTextEntry />
        <Input label="Belge Geçerlilik Tarihi (opsiyonel)" value={form.document_expiry_date ?? ""} onChangeText={(document_expiry_date) => setForm((f) => ({ ...f, document_expiry_date }))} editable={!readOnly} />
        {identity.subject_type === "employee" && (
          <>
            <Input label="Çalışan Rolü" value={form.employee_role ?? ""} onChangeText={(employee_role) => setForm((f) => ({ ...f, employee_role }))} editable={!readOnly} />
            <Input label="İşe Başlangıç Tarihi" value={form.employment_start_date ?? ""} onChangeText={(employment_start_date) => setForm((f) => ({ ...f, employment_start_date }))} editable={!readOnly} />
          </>
        )}
        {!readOnly && (
          <Pressable onPress={save} disabled={busy === "save"} style={s.primaryBtn}>
            {busy === "save" ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.primaryText}>Bilgileri Kaydet</Text>}
          </Pressable>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Belgeler</Text>
        {DOCUMENT_TYPES.map((doc) => (
          <Pressable key={doc.type} onPress={() => upload(doc.type)} disabled={!!busy || readOnly} style={s.docRow}>
            <Ionicons name={documentMap.has(doc.type) ? "checkmark-circle" : "cloud-upload"} size={20} color={documentMap.has(doc.type) ? COLORS.success : COLORS.brand} />
            <Text style={s.docText}>{doc.label}</Text>
            <Text style={s.docMeta}>{documentMap.has(doc.type) ? "Yüklendi" : "Yükle"}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Canlı Selfie</Text>
        <Text style={s.help}>Sahtecilik riskini azaltmak için rastgele hareketleri tamamlayıp selfie gönderin.</Text>
        {challenge && (
          <View style={s.challenge}>
            {challenge.actions.map((a) => <Text key={a} style={s.challengeText}>• {ACTION_LABEL[a] ?? a}</Text>)}
          </View>
        )}
        <Pressable onPress={challenge ? uploadSelfie : startLiveness} disabled={!!busy || readOnly} style={s.primaryBtn}>
          {busy === "challenge" || busy === "selfie" ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.primaryText}>{challenge ? "Selfie Çek ve Gönder" : "Liveness Adımlarını Al"}</Text>}
        </Pressable>
        {identity.latest_face && (
          <Text style={s.help}>Yüz: {identity.latest_face.face_present ? "bulundu" : "bulunamadı"} · Liveness: {identity.latest_face.liveness_score}/100 · Benzerlik: {identity.latest_face.similarity_score}/100</Text>
        )}
      </View>

      {(identity.latest_ocr || identity.latest_fraud) && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Analiz Sonuçları</Text>
          {identity.latest_ocr && <Text style={s.help}>OCR: {identity.latest_ocr.status} · Güven: {identity.latest_ocr.confidence}/100</Text>}
          {!!identity.latest_ocr?.mismatches?.length && <Text style={s.err}>OCR uyuşmazlıkları: {identity.latest_ocr.mismatches.join(", ")}</Text>}
          {identity.latest_fraud && <Text style={s.help}>Fraud Risk: {identity.latest_fraud.fraud_risk} · Önerilen durum: {IDENTITY_STATUS_LABEL[identity.latest_fraud.recommended_status] ?? identity.latest_fraud.recommended_status}</Text>}
          {!!identity.latest_fraud?.signals?.length && <Text style={s.help}>Sinyaller: {identity.latest_fraud.signals.join(", ")}</Text>}
        </View>
      )}
    </View>
  );
}

function Input(props: { label: string; value: string; onChangeText: (v: string) => void; editable: boolean; secureTextEntry?: boolean }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        editable={props.editable}
        secureTextEntry={props.secureTextEntry}
        placeholder={props.label}
        placeholderTextColor={COLORS.onSurfaceTertiary}
        style={[s.input, !props.editable && s.inputDisabled]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: SPACING.lg },
  card: { backgroundColor: COLORS.surfaceSecondary, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md },
  cardTitle: { color: COLORS.onSurface, fontFamily: TYPE.display, fontSize: 20, fontWeight: "800" },
  help: { color: COLORS.onSurfaceTertiary, lineHeight: 20 },
  masked: { color: COLORS.brand, fontWeight: "800" },
  badge: { overflow: "hidden", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 6, fontSize: 12, fontWeight: "900" },
  badgeOk: { color: COLORS.success, backgroundColor: "rgba(76,175,80,0.14)" },
  badgeWarn: { color: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  badgeBad: { color: COLORS.error, backgroundColor: "rgba(229,57,53,0.14)" },
  field: { gap: SPACING.xs },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, color: COLORS.onSurface, padding: SPACING.md },
  inputDisabled: { color: COLORS.onSurfaceTertiary },
  primaryBtn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, alignItems: "center", padding: SPACING.md },
  primaryText: { color: COLORS.onBrandPrimary, fontWeight: "900" },
  docRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md },
  docText: { color: COLORS.onSurface, flex: 1, fontWeight: "700" },
  docMeta: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  challenge: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.xs },
  challengeText: { color: COLORS.onSurface, fontWeight: "700" },
  err: { color: COLORS.error, fontWeight: "700" },
});
