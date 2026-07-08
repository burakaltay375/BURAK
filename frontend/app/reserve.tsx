import { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, Reservation } from "@/src/api";
import { autoFormatDate, isValidISODate, formatTrDate, nightsBetween } from "@/src/dates";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

export default function Reserve() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Reservation | null>(null);

  const datesValid = isValidISODate(checkIn) && isValidISODate(checkOut);
  const nights = nightsBetween(checkIn, checkOut);

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
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  if (result) {
    return (
      <SafeAreaView style={s.root} edges={["top", "bottom"]} testID="reserve-success-screen">
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark" size={40} color={COLORS.onBrandPrimary} />
          </View>
          <Text style={s.successTitle}>Rezervasyonunuz Oluşturuldu</Text>
          <Text style={s.successSub}>Otele giriş yaptığınızda aşağıdaki kod ile hesabınızı aktive edebilirsiniz:</Text>
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>Rezervasyon Kodu</Text>
            <Text style={s.codeValue} selectable testID="reservation-code">{result.access_code}</Text>
          </View>
          <View style={s.summary}>
            <Row label="Ad Soyad" value={result.customer_name} />
            <Row label="E-posta" value={result.customer_email} />
            <Row label="Telefon" value={result.customer_phone} />
            <Row label="Giriş" value={formatTrDate(result.check_in_date)} />
            <Row label="Çıkış" value={formatTrDate(result.check_out_date)} />
            {nightsBetween(result.check_in_date, result.check_out_date) !== null && (
              <Row label="Gece" value={`${nightsBetween(result.check_in_date, result.check_out_date)} gece`} />
            )}
            <Row label="Durum" value="Beklemede (otele check-in bekleniyor)" />
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

          <Pressable
            testID="reserve-submit-button"
            onPress={submit}
            disabled={loading || !name.trim() || !email.trim() || !phone.trim() || !datesValid || (nights ?? 0) < 1}
            style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }, (loading || !name.trim() || !email.trim() || !phone.trim() || !datesValid || (nights ?? 0) < 1) && { opacity: 0.5 }]}
          >
            {loading ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Rezervasyon Oluştur</Text>}
          </Pressable>

          <View style={s.note}>
            <Ionicons name="information-circle" size={16} color={COLORS.brand} />
            <Text style={s.noteText}>AI Concierge ve oda hizmetleri sadece check-in yapıldıktan sonra aktif olur.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
});
