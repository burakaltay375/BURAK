import { useCallback, useMemo, useState } from "react";
import { Alert, View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Hotel, type HotelServices, Reservation, User } from "@/src/api";
import { COLORS, SPACING, RADIUS, SERVICE_LABELS, TYPE } from "@/src/theme";

const SERVICE_ENTRIES = Object.entries(SERVICE_LABELS);

export default function SystemHotels() {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [form, setForm] = useState({ hotel_name: "", city: "", address: "" });
  const [editing, setEditing] = useState<{ id: string; hotel_name: string; city: string; address: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, u, m, r] = await Promise.all([
      api.listHotels(),
      api.listUsers(),
      api.listManagers(),
      api.listReservations(),
    ]);
    setHotels(h);
    setUsers(u);
    setManagers(m);
    setReservations(r);
    setErr(null);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setHotels([]);
      setUsers([]);
      setManagers([]);
      setReservations([]);
    });
  }, [load]));

  const hotelStats = useMemo(() => {
    const stats = new Map<string, { managers: string[]; userCount: number; reservationCount: number }>();
    for (const hotel of hotels ?? []) {
      const hotelUsers = users.filter((u) => (u.hotel_id ?? u.hotelId) === hotel.id);
      const hotelManagers = managers
        .filter((m) => (m.hotel_id ?? m.hotelId) === hotel.id)
        .map((m) => m.name);
      const hotelReservations = reservations.filter((r) => r.hotel_id === hotel.id);
      stats.set(hotel.id, {
        managers: hotelManagers,
        userCount: hotelUsers.length,
        reservationCount: hotelReservations.length,
      });
    }
    return stats;
  }, [hotels, managers, reservations, users]);

  const createHotel = async () => {
    setErr(null);
    setBusy("create");
    try {
      await api.createHotel({
        hotel_name: form.hotel_name.trim(),
        city: form.city.trim(),
        address: form.address.trim() || undefined,
      });
      setForm({ hotel_name: "", city: "", address: "" });
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
      await api.updateHotel(editing.id, {
        hotel_name: editing.hotel_name.trim(),
        city: editing.city.trim(),
        address: editing.address.trim() || undefined,
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
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
              <Pressable testID="create-hotel-button" disabled={busy === "create"} onPress={createHotel} style={s.primaryBtn}>
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
          return (
            <View style={s.card} testID={`hotel-${item.id}`}>
              {isEditing ? (
                <>
                  <TextInput value={editing.hotel_name} onChangeText={(hotel_name) => setEditing((e) => e && { ...e, hotel_name })} style={s.input} />
                  <TextInput value={editing.city} onChangeText={(city) => setEditing((e) => e && { ...e, city })} style={s.input} />
                  <TextInput value={editing.address} onChangeText={(address) => setEditing((e) => e && { ...e, address })} style={s.input} />
                  <View style={s.actions}>
                    <Pressable onPress={saveEdit} disabled={busy === item.id} style={s.actionBtn}><Text style={s.actionText}>Kaydet</Text></Pressable>
                    <Pressable onPress={() => setEditing(null)} style={s.actionBtn}><Text style={s.actionText}>İptal</Text></Pressable>
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
                    <Summary label="Rezervasyon" value={String(summary?.reservationCount ?? 0)} />
                  </View>
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
                    <Pressable testID={`edit-hotel-${item.id}`} onPress={() => setEditing({ id: item.id, hotel_name: item.hotel_name, city: item.city, address: item.address ?? "" })} style={s.actionBtn}>
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
  actions: { flexDirection: "row", gap: SPACING.sm },
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
