import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { api, type ReservationReferral, type RoomType } from "@/src/api";
import HospiraBrand from "@/src/components/HospiraBrand";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

const ROOM_TYPES: RoomType[] = ["Standard", "Deluxe", "Suite", "Family", "VIP"];
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

export default function GuestReservations() {
  const [checkIn, setCheckIn] = useState(today());
  const [checkOut, setCheckOut] = useState(tomorrow());
  const [guestCount, setGuestCount] = useState(1);
  const [roomType, setRoomType] = useState<RoomType>("Standard");
  const [items, setItems] = useState<ReservationReferral[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.myReservationReferrals()); }
    catch (e: any) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const referral = await api.createReservationReferral({
        check_in_date: checkIn,
        check_out_date: checkOut,
        guest_count: guestCount,
        room_type: roomType,
      });
      const url = new URL(referral.redirect_url);
      if (url.protocol !== "https:") throw new Error("Otel rezervasyon bağlantısı güvenli değil.");
      setItems((current) => [referral, ...current]);
      if (Platform.OS === "web") window.open(url.toString(), "_blank", "noopener,noreferrer");
      else await Linking.openURL(url.toString());
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <HospiraBrand compact />
        <Text style={s.title}>Hızlı Rezervasyon</Text>
        <Text style={s.sub}>Tercihlerinizi kaydedin, otelin resmi rezervasyon sayfasında işlemi tamamlayın.</Text>

        <View style={s.box}>
          <Text style={s.section}>Konaklama Bilgileri</Text>
          <Text style={s.label}>Giriş tarihi</Text>
          <TextInput style={s.input} value={checkIn} onChangeText={setCheckIn} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.onSurfaceTertiary} />
          <Text style={s.label}>Çıkış tarihi</Text>
          <TextInput style={s.input} value={checkOut} onChangeText={setCheckOut} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.onSurfaceTertiary} />

          <Text style={s.label}>Kişi sayısı</Text>
          <View style={s.counter}>
            <Pressable style={s.counterButton} onPress={() => setGuestCount(Math.max(1, guestCount - 1))}><Text style={s.counterText}>−</Text></Pressable>
            <Text style={s.counterValue}>{guestCount}</Text>
            <Pressable style={s.counterButton} onPress={() => setGuestCount(Math.min(20, guestCount + 1))}><Text style={s.counterText}>+</Text></Pressable>
          </View>

          <Text style={s.label}>Oda tipi</Text>
          <View style={s.chips}>
            {ROOM_TYPES.map((type) => (
              <Pressable key={type} onPress={() => setRoomType(type)} style={[s.chip, roomType === type && s.chipActive]}>
                <Text style={[s.chipText, roomType === type && s.chipTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={s.error}>{error}</Text>}
          <Pressable style={[s.primary, busy && s.disabled]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.primaryText}>Rezervasyonu Tamamla</Text>}
          </Pressable>
          <Text style={s.notice}>Devam ettiğinizde talebiniz “Bekleyen Talep” olarak kaydedilir ve otelin resmi HTTPS sayfası açılır.</Text>
        </View>

        <Text style={s.section}>Yönlendirme Geçmişim</Text>
        {items.map((item) => (
          <View key={item.id} style={s.card}>
            <View style={s.row}>
              <Text style={s.cardTitle}>{item.hotel_name}</Text>
              <Text style={s.badge}>Bekleyen Talep</Text>
            </View>
            <Text style={s.meta}>{item.check_in_date} → {item.check_out_date}</Text>
            <Text style={s.meta}>{item.guest_count} kişi · {item.room_type}</Text>
          </View>
        ))}
        {!items.length && <Text style={s.empty}>Henüz rezervasyon yönlendirmeniz yok.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl3 },
  title: { color: COLORS.onSurface, fontFamily: TYPE.display, fontSize: 28, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13, lineHeight: 19 },
  box: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, gap: SPACING.md },
  section: { color: COLORS.onSurface, fontFamily: TYPE.display, fontSize: 19, fontWeight: "700" },
  label: { color: COLORS.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  input: { backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md },
  counter: { flexDirection: "row", alignItems: "center", gap: SPACING.lg },
  counterButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  counterText: { color: COLORS.brand, fontSize: 22 },
  counterValue: { color: COLORS.onSurface, fontSize: 20, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: { borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  chipText: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  chipTextActive: { color: COLORS.brand, fontWeight: "700" },
  primary: { backgroundColor: COLORS.brand, padding: SPACING.lg, borderRadius: RADIUS.md, alignItems: "center" },
  disabled: { opacity: 0.65 },
  primaryText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  notice: { color: COLORS.onSurfaceTertiary, fontSize: 11, lineHeight: 16 },
  error: { color: COLORS.error, fontSize: 13 },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  cardTitle: { color: COLORS.onSurface, fontWeight: "700" },
  badge: { color: COLORS.brand, fontSize: 11, fontWeight: "700" },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", marginTop: SPACING.md },
});
