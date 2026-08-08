import { useCallback, useMemo, useState } from "react";
import { Alert, View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Hotel, type HotelServices, type UploadAsset, User } from "@/src/api";
import HotelMap from "@/src/components/HotelMap";
import HotelBrandingFields from "@/src/components/HotelBrandingFields";
import { COLORS, SPACING, RADIUS, SERVICE_LABELS, TYPE } from "@/src/theme";

const SERVICE_ENTRIES = Object.entries(SERVICE_LABELS);
type HotelForm = {
  hotel_name: string;
  city: string;
  address: string;
  reservation_url: string;
  latitude: string;
  longitude: string;
};

const EMPTY_FORM: HotelForm = {
  hotel_name: "",
  city: "",
  address: "",
  reservation_url: "",
  latitude: "",
  longitude: "",
};

function parsedCoordinates(form: Pick<HotelForm, "latitude" | "longitude">) {
  const latitudeText = form.latitude.trim();
  const longitudeText = form.longitude.trim();
  if (!latitudeText && !longitudeText) return null;
  if (!latitudeText || !longitudeText) {
    throw new Error("Enlem ve boylam birlikte girilmelidir.");
  }
  const latitude = Number(latitudeText.replace(",", "."));
  const longitude = Number(longitudeText.replace(",", "."));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("Enlem -90 ile 90 arasında olmalıdır.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Boylam -180 ile 180 arasında olmalıdır.");
  }
  return { latitude, longitude };
}

export default function SystemHotels() {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [form, setForm] = useState<HotelForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<(HotelForm & { id: string }) | null>(null);
  const [createLogo, setCreateLogo] = useState<UploadAsset | null>(null);
  const [createIntro, setCreateIntro] = useState<UploadAsset | null>(null);
  const [editLogo, setEditLogo] = useState<UploadAsset | null>(null);
  const [editIntro, setEditIntro] = useState<UploadAsset | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState<string | null>(null);
  const [visibleMapId, setVisibleMapId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, u, m] = await Promise.all([
      api.listHotels(),
      api.listUsers(),
      api.listManagers(),
    ]);
    setHotels(h);
    setUsers(u);
    setManagers(m);
    setErr(null);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setHotels([]);
      setUsers([]);
      setManagers([]);
    });
  }, [load]));

  const hotelStats = useMemo(() => {
    const stats = new Map<string, { managers: string[]; userCount: number; guestCount: number }>();
    for (const hotel of hotels ?? []) {
      const hotelUsers = users.filter((u) => (u.hotel_id ?? u.hotelId) === hotel.id);
      const hotelManagers = managers
        .filter((m) => (m.hotel_id ?? m.hotelId) === hotel.id)
        .map((m) => m.name);
      const guestCount = hotelUsers.filter((u) => u.role === "guest").length;
      stats.set(hotel.id, {
        managers: hotelManagers,
        userCount: hotelUsers.length,
        guestCount,
      });
    }
    return stats;
  }, [hotels, managers, users]);
  const formCoordinates = useMemo(() => {
    try {
      return parsedCoordinates(form);
    } catch {
      return null;
    }
  }, [form]);

  const createHotel = async () => {
    setErr(null);
    setBusy("create");
    try {
      if (!createLogo) throw new Error("Otel oluşturmak için logo yüklemek zorunludur.");
      const coordinates = parsedCoordinates(form);
      await api.createHotel({
        hotel_name: form.hotel_name.trim(),
        city: form.city.trim(),
        address: form.address.trim() || undefined,
        reservation_url: form.reservation_url.trim() || undefined,
        ...(coordinates ?? {}),
        logo: createLogo,
        intro_video: createIntro,
      });
      setForm(EMPTY_FORM);
      setCreateLogo(null);
      setCreateIntro(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const toggleHotel = async (hotel: Hotel) => {
    setBusy(hotel.id);
    try {
      await api.setHotelActive(hotel.id, !hotel.active);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const toggleHotelService = async (hotel: Hotel, key: string) => {
    setBusy(`${hotel.id}:${key}`);
    setErr(null);
    try {
      const services: HotelServices = { ...(hotel.services ?? {}), [key]: !(hotel.services?.[key] ?? true) };
      await api.updateHotel(hotel.id, { services });
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const deleteHotel = async (hotel: Hotel) => {
    Alert.alert("Otel silinsin mi?", `${hotel.hotel_name} ve bağlı hesaplar devre dışı bırakılacak.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setBusy(hotel.id);
          try {
            await api.deleteHotel(hotel.id);
            await load();
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setErr(null);
    setBusy(editing.id);
    try {
      const coordinates = parsedCoordinates(editing);
      await api.updateHotel(editing.id, {
        hotel_name: editing.hotel_name.trim(),
        city: editing.city.trim(),
        address: editing.address.trim() || undefined,
        reservation_url: editing.reservation_url.trim() || undefined,
        ...(coordinates ?? {}),
      });
      if (editLogo) await api.updateHotelBranding(editing.id, "logo", editLogo);
      if (editIntro) await api.updateHotelBranding(editing.id, "intro", editIntro);
      setEditing(null);
      setEditLogo(null);
      setEditIntro(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const findCoordinates = async (target: "create" | "edit") => {
    const source = target === "create" ? form : editing;
    if (!source) return;
    const query = [source.address.trim(), source.city.trim()].filter(Boolean).join(", ");
    if (source.address.trim().length < 3) {
      setErr("Konum aramak için açık bir adres girin.");
      return;
    }
    setErr(null);
    setGeocoding(target === "create" ? "create" : editing!.id);
    try {
      const results = await api.geocodeAddress(query);
      const first = results[0];
      if (!first) throw new Error("Bu adres için konum bulunamadı.");
      const coordinates = {
        latitude: String(first.latitude),
        longitude: String(first.longitude),
      };
      if (target === "create") {
        setForm((current) => ({ ...current, ...coordinates }));
      } else {
        setEditing((current) => current && ({ ...current, ...coordinates }));
      }
    } catch (e: any) {
      setErr(e.message || "Adres aranamadı.");
    } finally {
      setGeocoding(null);
    }
  };

  if (!hotels) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="system-hotels-screen">
      <FlatList
        ListHeaderComponent={(
          <View style={s.header}>
            <Text style={s.title}>Oteller</Text>
            <Text style={s.sub}>{hotels.length} kayıt · platform kapsamı</Text>
            {err && <Text style={s.err}>{err}</Text>}
            <View style={s.form}>
              <TextInput testID="hotel-name-input" placeholder="Otel adı" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.hotel_name} onChangeText={(hotel_name) => setForm((f) => ({ ...f, hotel_name }))} style={s.input} />
              <TextInput testID="hotel-city-input" placeholder="Şehir" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.city} onChangeText={(city) => setForm((f) => ({ ...f, city }))} style={s.input} />
              <TextInput testID="hotel-address-input" placeholder="Adres (opsiyonel)" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.address} onChangeText={(address) => setForm((f) => ({ ...f, address }))} style={s.input} />
              <TextInput placeholder="Resmi rezervasyon URL (https://...)" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" value={form.reservation_url} onChangeText={(reservation_url) => setForm((f) => ({ ...f, reservation_url }))} style={s.input} />
              <Pressable testID="geocode-create-button" disabled={geocoding === "create"} onPress={() => findCoordinates("create")} style={s.locationBtn}>
                <Ionicons name="locate" size={17} color={COLORS.brand} />
                <Text style={s.actionText}>{geocoding === "create" ? "Konum aranıyor..." : "Konumu Bul"}</Text>
              </Pressable>
              <View style={s.coordinateRow}>
                <TextInput keyboardType="decimal-pad" placeholder="Latitude" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.latitude} onChangeText={(latitude) => setForm((f) => ({ ...f, latitude }))} style={[s.input, s.coordinateInput]} />
                <TextInput keyboardType="decimal-pad" placeholder="Longitude" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.longitude} onChangeText={(longitude) => setForm((f) => ({ ...f, longitude }))} style={[s.input, s.coordinateInput]} />
              </View>
              {!!formCoordinates && (
                <View style={s.mapFrame}>
                  <HotelMap latitude={formCoordinates.latitude} longitude={formCoordinates.longitude} hotelName={form.hotel_name || "Yeni Otel"} />
                </View>
              )}
              <HotelBrandingFields
                logo={createLogo}
                intro={createIntro}
                logoRequired
                disabled={busy === "create"}
                onLogoChange={setCreateLogo}
                onIntroChange={setCreateIntro}
                onError={setErr}
              />
              <Pressable testID="create-hotel-button" disabled={busy === "create" || !createLogo} onPress={createHotel} style={[s.primaryBtn, !createLogo && { opacity: 0.5 }]}>
                <Text style={s.primaryText}>{busy === "create" ? "Ekleniyor..." : "Otel Ekle"}</Text>
              </Pressable>
            </View>
          </View>
        )}
        data={hotels}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Henüz otel yok</Text>}
        renderItem={({ item }) => {
          const isEditing = editing?.id === item.id;
          const summary = hotelStats.get(item.id);
          let editingCoordinates: { latitude: number; longitude: number } | null = null;
          if (isEditing && editing) {
            try {
              editingCoordinates = parsedCoordinates(editing);
            } catch {
              editingCoordinates = null;
            }
          }
          return (
            <View style={s.card} testID={`hotel-${item.id}`}>
              {isEditing ? (
                <>
                  <TextInput value={editing.hotel_name} onChangeText={(hotel_name) => setEditing((e) => e && { ...e, hotel_name })} style={s.input} />
                  <TextInput value={editing.city} onChangeText={(city) => setEditing((e) => e && { ...e, city })} style={s.input} />
                  <TextInput value={editing.address} onChangeText={(address) => setEditing((e) => e && { ...e, address })} style={s.input} />
                  <TextInput placeholder="Resmi rezervasyon URL (https://...)" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" value={editing.reservation_url} onChangeText={(reservation_url) => setEditing((e) => e && { ...e, reservation_url })} style={s.input} />
                  <Pressable disabled={geocoding === item.id} onPress={() => findCoordinates("edit")} style={s.locationBtn}>
                    <Ionicons name="locate" size={17} color={COLORS.brand} />
                    <Text style={s.actionText}>{geocoding === item.id ? "Konum aranıyor..." : "Konumu Bul"}</Text>
                  </Pressable>
                  <View style={s.coordinateRow}>
                    <TextInput keyboardType="decimal-pad" placeholder="Latitude" placeholderTextColor={COLORS.onSurfaceTertiary} value={editing.latitude} onChangeText={(latitude) => setEditing((e) => e && { ...e, latitude })} style={[s.input, s.coordinateInput]} />
                    <TextInput keyboardType="decimal-pad" placeholder="Longitude" placeholderTextColor={COLORS.onSurfaceTertiary} value={editing.longitude} onChangeText={(longitude) => setEditing((e) => e && { ...e, longitude })} style={[s.input, s.coordinateInput]} />
                  </View>
                  {!!editingCoordinates && (
                    <View style={s.mapFrame}>
                      <HotelMap latitude={editingCoordinates.latitude} longitude={editingCoordinates.longitude} hotelName={editing.hotel_name || item.hotel_name} />
                    </View>
                  )}
                  <HotelBrandingFields
                    logo={editLogo}
                    intro={editIntro}
                    existingLogoUrl={item.logo_url}
                    existingIntroUrl={item.intro_video_url}
                    disabled={busy === item.id}
                    onLogoChange={setEditLogo}
                    onIntroChange={setEditIntro}
                    onDeleteExistingLogo={async () => { await api.deleteHotelBranding(item.id, "logo"); await load(); }}
                    onDeleteExistingIntro={async () => { await api.deleteHotelBranding(item.id, "intro"); await load(); }}
                    onError={setErr}
                  />
                  <View style={s.actions}>
                    <Pressable onPress={saveEdit} disabled={busy === item.id} style={s.actionBtn}><Text style={s.actionText}>Kaydet</Text></Pressable>
                    <Pressable onPress={() => { setEditing(null); setEditLogo(null); setEditIntro(null); }} style={s.actionBtn}><Text style={s.actionText}>İptal</Text></Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.hotelName}>{item.hotel_name}</Text>
                      <Text style={s.meta}>{item.city}{item.address ? ` · ${item.address}` : ""}</Text>
                    </View>
                    <Text style={[s.badge, item.active ? s.active : s.inactive]}>{item.active ? "Aktif" : "Pasif"}</Text>
                  </View>
                  <View style={s.summaryGrid}>
                    <Summary label="Manager" value={summary?.managers.join(", ") || "Atanmadı"} />
                    <Summary label="Kullanıcı" value={String(summary?.userCount ?? 0)} />
                    <Summary label="Misafir" value={String(summary?.guestCount ?? 0)} />
                  </View>
                  {visibleMapId === item.id && item.latitude != null && item.longitude != null && (
                    <View style={s.mapFrame}>
                      <HotelMap latitude={item.latitude} longitude={item.longitude} hotelName={item.hotel_name} />
                    </View>
                  )}
                  <View style={s.services}>
                    <Text style={s.servicesTitle}>Servisler</Text>
                    <View style={s.serviceGrid}>
                      {SERVICE_ENTRIES.map(([key, label]) => {
                        const enabled = item.services?.[key] ?? true;
                        return (
                          <Pressable
                            key={key}
                            testID={`system-hotel-service-${item.id}-${key}`}
                            onPress={() => toggleHotelService(item, key)}
                            disabled={busy === `${item.id}:${key}`}
                            style={[s.serviceChip, enabled && s.serviceChipActive]}
                          >
                            <Text style={[s.serviceText, enabled && s.serviceTextActive]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <View style={s.actions}>
                    {item.latitude != null && item.longitude != null && (
                      <Pressable onPress={() => setVisibleMapId((current) => current === item.id ? null : item.id)} style={s.actionBtn}>
                        <Ionicons name="map" size={16} color={COLORS.brand} />
                        <Text style={s.actionText}>{visibleMapId === item.id ? "Haritayı Gizle" : "Haritayı Göster"}</Text>
                      </Pressable>
                    )}
                    <Pressable testID={`edit-hotel-${item.id}`} onPress={() => {
                      setEditLogo(null);
                      setEditIntro(null);
                      setEditing({
                        id: item.id,
                        hotel_name: item.hotel_name,
                        city: item.city,
                        address: item.address ?? "",
                        reservation_url: item.reservation_url ?? "",
                        latitude: item.latitude != null ? String(item.latitude) : "",
                        longitude: item.longitude != null ? String(item.longitude) : "",
                      });
                    }} style={s.actionBtn}>
                      <Ionicons name="create" size={16} color={COLORS.brand} />
                      <Text style={s.actionText}>Düzenle</Text>
                    </Pressable>
                    <Pressable testID={`toggle-hotel-${item.id}`} onPress={() => toggleHotel(item)} disabled={busy === item.id} style={s.actionBtn}>
                      <Ionicons name={item.active ? "pause-circle" : "play-circle"} size={16} color={COLORS.brand} />
                      <Text style={s.actionText}>{item.active ? "Pasifleştir" : "Aktifleştir"}</Text>
                    </Pressable>
                    <Pressable testID={`delete-hotel-${item.id}`} onPress={() => deleteHotel(item)} disabled={busy === item.id} style={s.actionBtn}>
                      <Ionicons name="trash" size={16} color={COLORS.error} />
                      <Text style={[s.actionText, { color: COLORS.error }]}>Sil</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryItem}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, gap: SPACING.md },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary },
  form: { gap: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  input: { backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  coordinateRow: { flexDirection: "row", gap: SPACING.sm },
  coordinateInput: { flex: 1 },
  locationBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xs,
    padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  mapFrame: {
    height: 220, overflow: "hidden", borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surfaceTertiary,
  },
  primaryBtn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center" },
  primaryText: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 13 },
  list: { paddingBottom: SPACING.xl2 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.lg },
  card: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  hotelName: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  badge: { overflow: "hidden", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  active: { backgroundColor: COLORS.success, color: COLORS.surface },
  inactive: { backgroundColor: COLORS.surfaceTertiary, color: COLORS.onSurfaceSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  summaryItem: { flexGrow: 1, flexBasis: "30%", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  summaryLabel: { color: COLORS.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  summaryValue: { color: COLORS.onSurface, fontSize: 12, fontWeight: "700", marginTop: 4 },
  services: { gap: SPACING.sm },
  servicesTitle: { color: COLORS.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  serviceChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface },
  serviceChipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  serviceText: { color: COLORS.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  serviceTextActive: { color: COLORS.brand },
});
