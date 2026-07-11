import { useEffect, useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, Reservation, ReservationIdentityStartResult, Room } from "@/src/api";
import { autoFormatDate, isValidISODate, formatTrDate, nightsBetween } from "@/src/dates";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

export default function Reserve() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [identityRequested, setIdentityRequested] = useState(false);
  const [identityStarting, setIdentityStarting] = useState(false);
  const [identityWorkflow, setIdentityWorkflow] = useState<ReservationIdentityStartResult | null>(null);
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [identityNotice, setIdentityNotice] = useState<string | null>(null);
  const [memberNames, setMemberNames] = useState<string[]>(["", "", "", ""]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Reservation | null>(null);

  const datesValid = isValidISODate(checkIn) && isValidISODate(checkOut);
  const nights = nightsBetween(checkIn, checkOut);
  const totalPrice = selectedRoom && nights ? selectedRoom.price_per_night * nights : 0;
  const memberDrafts = [
    { relation: "Adult 1", name: name.trim() },
    { relation: "Adult 2", name: memberNames[1]?.trim() || "" },
    { relation: "Child 1", name: memberNames[2]?.trim() || "" },
    { relation: "Child 2", name: memberNames[3]?.trim() || "" },
  ].slice(0, capacity);
  const identityMembers = [
    { relation: "Adult 1", name: name.trim() },
    { relation: "Adult 2", name: memberNames[1]?.trim() || "" },
    { relation: "Child 1", name: memberNames[2]?.trim() || "" },
    { relation: "Child 2", name: memberNames[3]?.trim() || "" },
  ].slice(0, capacity).filter((m) => m.name);

  useEffect(() => {
    let cancelled = false;
    setSelectedRoom(null);
    if (!datesValid || (nights ?? 0) < 1) {
      setRooms([]);
      return;
    }
    setRoomsLoading(true);
    api.availableRooms({ check_in_date: checkIn, check_out_date: checkOut, capacity })
      .then((data) => { if (!cancelled) setRooms(data); })
      .catch((e: any) => { if (!cancelled) { setErr(e.message); setRooms([]); } })
      .finally(() => { if (!cancelled) setRoomsLoading(false); });
    return () => { cancelled = true; };
  }, [capacity, checkIn, checkOut, datesValid, nights]);

  const submit = async () => {
    setErr(null);
    if (!isValidISODate(checkIn) || !isValidISODate(checkOut)) {
      setErr("Tarihleri YYYY-AA-GG formatında girin."); return;
    }
    if ((nights ?? 0) < 1) {
      setErr("Çıkış tarihi giriş tarihinden sonra olmalı."); return;
    }
    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const r = await api.createReservation({
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_phone: phone.trim(),
        check_in_date: checkIn,
        check_out_date: checkOut,
        capacity,
        room_id: selectedRoom?.id,
        room_number: selectedRoom?.room_number,
        identity_verification_requested: identityRequested,
        identity_members: identityRequested ? identityMembers : undefined,
        identity_session_id: identityWorkflow?.session_id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  const startIdentityWorkflow = async () => {
    if (identityRequested) {
      setIdentityRequested(false);
      setIdentityModalOpen(false);
      setIdentityNotice("Identity verification cancelled before reservation submission.");
      return;
    }
    setIdentityStarting(true);
    setErr(null);
    setIdentityNotice(null);
    try {
      const result = await api.startReservationIdentity({
        customer_name: name.trim(),
        customer_email: email.trim(),
        capacity,
        identity_members: memberDrafts,
      });
      setIdentityWorkflow(result);
      setIdentityRequested(true);
      setIdentityModalOpen(true);
      setIdentityNotice("Identity verification workflow started successfully.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const message = e?.message || "Identity verification could not be started";
      setIdentityRequested(false);
      setIdentityWorkflow(null);
      setIdentityModalOpen(false);
      setErr(message);
      setIdentityNotice(`Identity verification failed: ${message}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIdentityStarting(false);
    }
  };

  if (result) {
    const fullyVerified = result.identity_status === "fully_verified" || result.identity_status === "verified_by_hotel";
    const failed = result.identity_status === "verification_failed" || result.identity_status === "failed";
    return (
      <SafeAreaView style={s.root} edges={["top", "bottom"]} testID="reserve-success-screen">
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name={fullyVerified ? "checkmark" : failed ? "warning" : "time"} size={40} color={COLORS.onBrandPrimary} />
          </View>
          <Text style={s.successTitle}>Rezervasyonunuz Oluşturuldu</Text>
          <Text style={s.successSub}>
            {result.identity_verification_requested
              ? fullyVerified
                ? "✅ Identity Verification Completed. Hotel Entry Code Generated."
                : failed
                  ? "Kimlik doğrulaması başarısız oldu. Hotel manager manuel inceleme yapacak."
                  : "Kimlik doğrulaması başlatıldı. Tüm misafirler doğrulanınca Hotel Entry Code üretilecek."
              : "Otele giriş yaptığınızda aşağıdaki kod ile hesabınızı aktive edebilirsiniz:"}
          </Text>
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>{result.identity_verification_requested && !fullyVerified ? "Verification Status" : "Hotel Entry Code"}</Text>
            <Text style={s.codeValue} selectable testID="reservation-code">{result.access_code}</Text>
          </View>
          <View style={s.summary}>
            <Row label="Ad Soyad" value={result.customer_name} />
            <Row label="E-posta" value={result.customer_email} />
            <Row label="Telefon" value={result.customer_phone} />
            <Row label="Oda" value={result.room_name || result.room_number || "—"} />
            <Row label="Giriş" value={formatTrDate(result.check_in_date)} />
            <Row label="Çıkış" value={formatTrDate(result.check_out_date)} />
            {nightsBetween(result.check_in_date, result.check_out_date) !== null && (
              <Row label="Gece" value={`${nightsBetween(result.check_in_date, result.check_out_date)} gece`} />
            )}
            {result.total_price !== null && result.total_price !== undefined && (
              <Row label="Toplam Ücret" value={money(result.total_price)} />
            )}
            <Row label="Durum" value="Beklemede (otele check-in bekleniyor)" />
            {result.identity_verification_requested && (
              <>
                <Row label="Kimlik Doğrulama" value={fullyVerified ? "✓ Fully Verified" : failed ? "Verification Failed" : result.identity_status === "partially_verified" ? "Partially Verified" : "Waiting For Verification"} />
                <Row label="Doğrulama İlerlemesi" value={`${result.identity_members.filter((m) => m.status === "verified").length}/${result.identity_members.length} kişi`} />
              </>
            )}
            <Row label="E-posta Bildirimi" value={result.email_sent ? "Gönderildi ✓" : "Sandbox / log-only"} />
          </View>
          <Pressable testID="goto-login-from-success" onPress={() => router.replace("/login")} style={s.btn}>
            <Text style={s.btnText}>Giriş Ekranına Dön</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="reserve-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} testID="reserve-back-button" style={s.backBtn}>
            <Text style={s.back}>‹ Geri</Text>
          </Pressable>
          <Text style={s.title}>Rezervasyon Yap</Text>
          <Text style={s.subtitle}>Şifreye gerek yok — sadece iletişim bilgilerinizi paylaşın. Otele girişte kendi şifrenizi belirleyebilirsiniz.</Text>

          {err && <Text style={s.err} testID="reserve-error">{err}</Text>}

          <TextInput testID="reserve-name-input" placeholder="Ad Soyad" placeholderTextColor={COLORS.onSurfaceTertiary} value={name} onChangeText={setName} style={s.input} />
          <TextInput testID="reserve-email-input" placeholder="E-posta" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={s.input} />
          <TextInput testID="reserve-phone-input" placeholder="Telefon (+90 5xx xxx xx xx)" placeholderTextColor={COLORS.onSurfaceTertiary} keyboardType="phone-pad" value={phone} onChangeText={setPhone} style={s.input} />

          <View style={s.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.dateLabel}>Giriş</Text>
              <TextInput
                testID="reserve-checkin-input"
                placeholder="YYYY-AA-GG"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                keyboardType="number-pad"
                value={checkIn}
                onChangeText={(v) => setCheckIn(autoFormatDate(v))}
                maxLength={10}
                style={[s.input, !!checkIn && !isValidISODate(checkIn) && { borderColor: COLORS.error }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.dateLabel}>Çıkış</Text>
              <TextInput
                testID="reserve-checkout-input"
                placeholder="YYYY-AA-GG"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                keyboardType="number-pad"
                value={checkOut}
                onChangeText={(v) => setCheckOut(autoFormatDate(v))}
                maxLength={10}
                style={[s.input, !!checkOut && !isValidISODate(checkOut) && { borderColor: COLORS.error }]}
              />
            </View>
          </View>
          {datesValid && nights !== null && nights > 0 && (
            <Text style={s.nightsHint} testID="reserve-nights-hint">{nights} gece konaklama</Text>
          )}

          <Text style={s.sectionLabel}>Kişi Sayısı</Text>
          <View style={s.capacityRow}>
            {[1, 2, 3, 4].map((n) => (
              <Pressable key={n} onPress={() => setCapacity(n)} style={[s.capacityChip, capacity === n && s.capacityChipActive]}>
                <Text style={[s.capacityText, capacity === n && s.capacityTextActive]}>{n} kişi</Text>
              </Pressable>
            ))}
          </View>

          {capacity > 1 && (
            <View style={s.identityBox}>
              <Text style={s.sectionLabel}>Additional Guests</Text>
              {capacity >= 2 && (
                <TextInput placeholder="Adult 2 name" placeholderTextColor={COLORS.onSurfaceTertiary} value={memberNames[1]} onChangeText={(v) => setMemberNames((m) => { const next = [...m]; next[1] = v; return next; })} style={s.input} />
              )}
              {capacity >= 3 && (
                <TextInput placeholder="Child 1 name" placeholderTextColor={COLORS.onSurfaceTertiary} value={memberNames[2]} onChangeText={(v) => setMemberNames((m) => { const next = [...m]; next[2] = v; return next; })} style={s.input} />
              )}
              {capacity >= 4 && (
                <TextInput placeholder="Child 2 name" placeholderTextColor={COLORS.onSurfaceTertiary} value={memberNames[3]} onChangeText={(v) => setMemberNames((m) => { const next = [...m]; next[3] = v; return next; })} style={s.input} />
              )}
            </View>
          )}

          <Pressable onPress={startIdentityWorkflow} disabled={identityStarting} style={s.identityToggle} testID="reserve-identity-toggle">
            {identityStarting ? <ActivityIndicator color={COLORS.brand} /> : <Ionicons name={identityRequested ? "checkbox" : "square-outline"} size={22} color={identityRequested ? COLORS.brand : COLORS.onSurfaceTertiary} />}
            <View style={{ flex: 1 }}>
              <Text style={s.identityTitle}>Start Identity Verification</Text>
              <Text style={s.identitySub}>{identityStarting ? "Starting verification workflow..." : "Creates a separate verification record for every guest immediately."}</Text>
            </View>
          </Pressable>
          {identityNotice && <Text style={identityRequested ? s.identitySuccess : s.err}>{identityNotice}</Text>}
          {identityRequested && (
            <View style={s.identityBox}>
              <Text style={s.sectionLabel}>Doğrulanacak Kişiler</Text>
              {(identityWorkflow?.identity_members ?? identityMembers.map((m, index) => ({ ...m, id: `${m.relation}-${index}`, verification_id: null, status: "pending" }))).map((member) => (
                <Text key={member.verification_id ?? member.id} style={s.identityMember}>
                  {member.relation}: {member.name} · {member.status}
                </Text>
              ))}
            </View>
          )}

          {datesValid && (nights ?? 0) > 0 && (
            <View style={s.roomSection}>
              <View style={s.roomSectionTop}>
                <Text style={s.sectionLabel}>Uygun Odalar</Text>
                {roomsLoading && <ActivityIndicator color={COLORS.brand} size="small" />}
              </View>
              {!roomsLoading && rooms.length === 0 && <Text style={s.emptyRooms}>Bu tarih ve kişi sayısı için uygun oda bulunamadı.</Text>}
              <View style={s.roomsGrid}>
                {rooms.map((room) => {
                  const active = selectedRoom?.id === room.id;
                  return (
                    <Pressable
                      key={room.id}
                      testID={`reserve-room-${room.room_number}`}
                      onPress={() => setSelectedRoom(room)}
                      style={[s.roomCard, active && s.roomCardActive]}
                    >
                      <Text style={[s.roomNumber, active && s.roomTextActive]}>{room.room_name || room.room_number}</Text>
                      <Text style={[s.roomMeta, active && s.roomTextActive]}>{room.room_type} · Kat {room.floor || "—"}</Text>
                      <Text style={[s.roomMeta, active && s.roomTextActive]}>{room.capacity} kişi · {money(room.price_per_night)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {selectedRoom && nights && nights > 0 && (
            <View style={s.priceBox} testID="reserve-price-summary">
              <Text style={s.priceTitle}>{selectedRoom.room_name || `${selectedRoom.room_type} ${selectedRoom.room_number}`}</Text>
              <Text style={s.priceLine}>{money(selectedRoom.price_per_night)} / Gece</Text>
              <Text style={s.priceLine}>{nights} Gece</Text>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Toplam</Text>
                <Text style={s.totalValue}>{money(totalPrice)}</Text>
              </View>
            </View>
          )}

          <Pressable
            testID="reserve-submit-button"
            onPress={submit}
            disabled={loading || !name.trim() || !email.trim() || !phone.trim() || !datesValid || (nights ?? 0) < 1 || !selectedRoom || (identityRequested && identityMembers.length < capacity)}
            style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }, (loading || !name.trim() || !email.trim() || !phone.trim() || !datesValid || (nights ?? 0) < 1 || !selectedRoom || (identityRequested && identityMembers.length < capacity)) && { opacity: 0.5 }]}
          >
            {loading ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Rezervasyon Oluştur</Text>}
          </Pressable>

          <View style={s.note}>
            <Ionicons name="information-circle" size={16} color={COLORS.brand} />
            <Text style={s.noteText}>AI Concierge ve oda hizmetleri sadece check-in yapıldıktan sonra aktif olur.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={identityModalOpen} transparent animationType="slide" onRequestClose={() => setIdentityModalOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.identityModal}>
            <View style={s.modalIcon}>
              <Ionicons name="shield-checkmark" size={30} color={COLORS.onBrandPrimary} />
            </View>
            <Text style={s.modalTitle}>Identity Verification Started</Text>
            <Text style={s.modalText}>A separate verification workflow was created for each guest. The hotel entry code will only be generated after all guests are verified.</Text>
            <View style={s.modalMembers}>
              {(identityWorkflow?.identity_members ?? []).map((member) => (
                <Text key={member.verification_id ?? member.id} style={s.modalMember}>{member.relation}: {member.name} · {member.status}</Text>
              ))}
            </View>
            <Pressable onPress={() => setIdentityModalOpen(false)} style={s.btn}>
              <Text style={s.btnText}>Continue Reservation</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function money(value: number) {
  return `₺${Math.round(value || 0).toLocaleString("tr-TR")}`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { padding: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.md },
  backBtn: { alignSelf: "flex-start", paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  back: { color: COLORS.brand, fontSize: 16 },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceSecondary, lineHeight: 19, marginBottom: SPACING.md },
  input: { backgroundColor: COLORS.surfaceSecondary, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  dateRow: { flexDirection: "row", gap: SPACING.sm },
  dateLabel: { color: COLORS.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, marginLeft: 4 },
  nightsHint: { color: COLORS.brand, fontSize: 12, textAlign: "center", marginTop: -SPACING.sm },
  sectionLabel: { color: COLORS.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginLeft: 4 },
  capacityRow: { flexDirection: "row", gap: SPACING.sm },
  capacityChip: { flex: 1, alignItems: "center", paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  capacityChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  capacityText: { color: COLORS.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
  capacityTextActive: { color: COLORS.onBrandPrimary },
  identityToggle: { flexDirection: "row", gap: SPACING.md, alignItems: "flex-start", backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md },
  identityTitle: { color: COLORS.onSurface, fontWeight: "800" },
  identitySub: { color: COLORS.onSurfaceTertiary, fontSize: 12, lineHeight: 18, marginTop: 2 },
  identityBox: { gap: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md },
  identityMember: { color: COLORS.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  identitySuccess: { color: COLORS.success, fontSize: 13, fontWeight: "700" },
  roomSection: { gap: SPACING.sm },
  roomSectionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emptyRooms: { color: COLORS.onSurfaceTertiary, fontSize: 13, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  roomsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  roomCard: { width: "48%", minHeight: 112, borderRadius: RADIUS.lg, backgroundColor: "rgba(76,175,80,0.14)", borderWidth: 1, borderColor: COLORS.success, padding: SPACING.md, justifyContent: "center", gap: 4 },
  roomCardActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  roomNumber: { color: COLORS.onSurface, fontSize: 17, fontFamily: TYPE.display, fontWeight: "800" },
  roomMeta: { color: COLORS.onSurfaceSecondary, fontSize: 11 },
  roomTextActive: { color: COLORS.onBrandPrimary },
  priceBox: { backgroundColor: COLORS.brandTertiary, borderWidth: 1, borderColor: COLORS.brand, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.xs },
  priceTitle: { color: COLORS.onBrandTertiary, fontSize: 18, fontFamily: TYPE.display, fontWeight: "800" },
  priceLine: { color: COLORS.onBrandTertiary, fontSize: 13 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.brand },
  totalLabel: { color: COLORS.onBrandTertiary, fontSize: 13, fontWeight: "700" },
  totalValue: { color: COLORS.brand, fontSize: 22, fontFamily: TYPE.display, fontWeight: "900" },
  btn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, alignItems: "center", marginTop: SPACING.md },
  btnText: { color: COLORS.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 14 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginTop: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  noteText: { color: COLORS.onSurfaceSecondary, fontSize: 12, flex: 1, lineHeight: 17 },

  successWrap: { padding: SPACING.xl, gap: SPACING.md, alignItems: "center" },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.success, alignItems: "center", justifyContent: "center", marginTop: SPACING.xl },
  successTitle: { color: COLORS.onSurface, fontSize: 24, fontFamily: TYPE.display, fontWeight: "700", textAlign: "center" },
  successSub: { color: COLORS.onSurfaceSecondary, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: SPACING.md },
  codeBox: { width: "100%", padding: SPACING.lg, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.lg, alignItems: "center", borderWidth: 1, borderColor: COLORS.brand },
  codeLabel: { color: COLORS.onBrandTertiary, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  codeValue: { color: COLORS.brand, fontSize: 36, fontFamily: TYPE.display, fontWeight: "800", letterSpacing: 6, marginTop: SPACING.sm },
  summary: { width: "100%", backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.md },
  row: { flexDirection: "row", justifyContent: "space-between", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  rowLabel: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  rowValue: { color: COLORS.onSurface, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "flex-end" },
  identityModal: { backgroundColor: COLORS.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  modalIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.success, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  modalTitle: { color: COLORS.onSurface, fontFamily: TYPE.display, fontSize: 22, fontWeight: "800", textAlign: "center" },
  modalText: { color: COLORS.onSurfaceSecondary, fontSize: 13, lineHeight: 20, textAlign: "center" },
  modalMembers: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.xs },
  modalMember: { color: COLORS.onSurface, fontSize: 13, fontWeight: "700" },
});
