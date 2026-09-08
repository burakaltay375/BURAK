import { useCallback, useMemo, useState } from "react";
import { Alert, View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Hotel, User } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

export default function SystemManagers() {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [managers, setManagers] = useState<User[] | null>(null);
  const [form, setForm] = useState({ hotel_id: "", name: "", email: "", password: "" });
  const [editing, setEditing] = useState<{ id: string; name: string; email: string; hotel_id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, m] = await Promise.all([api.listHotels(), api.listManagers()]);
    setHotels(h);
    setManagers(m);
    setForm((f) => ({ ...f, hotel_id: f.hotel_id || h[0]?.id || "" }));
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setHotels([]);
      setManagers([]);
    });
  }, [load]));

  const hotelName = useMemo(() => {
    const map = new Map((hotels ?? []).map((h) => [h.id, h.hotel_name]));
    return (id?: string | null) => map.get(id ?? "") ?? "Otel seçilmedi";
  }, [hotels]);

  const createManager = async () => {
    setErr(null); setBusy("create");
    try {
      await api.createManager({
        hotel_id: form.hotel_id,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setForm((f) => ({ hotel_id: f.hotel_id, name: "", email: "", password: "" }));
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setErr(null); setBusy(editing.id);
    try {
      await api.updateManager(editing.id, {
        name: editing.name.trim(),
        email: editing.email.trim(),
        hotel_id: editing.hotel_id,
      });
      setEditing(null);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const toggleManager = async (manager: User) => {
    setBusy(manager.id);
    try {
      await api.updateManager(manager.id, { active: !(manager.active ?? true) });
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const deleteManager = async (manager: User) => {
    Alert.alert("Manager silinsin mi?", `${manager.name} hesabı kalıcı olarak silinecek.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setBusy(manager.id);
          try {
            await api.deleteManager(manager.id);
            await load();
          } catch (e: any) { setErr(e.message); }
          finally { setBusy(null); }
        },
      },
    ]);
  };

  if (!hotels || !managers) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="system-managers-screen">
      <FlatList
        ListHeaderComponent={(
          <View style={s.header}>
            <Text style={s.title}>Hotel Manager</Text>
            <Text style={s.sub}>{managers.length} manager · sadece sistem yöneticisi</Text>
            {err && <Text style={s.err}>{err}</Text>}
            <View style={s.form}>
              <Text style={s.label}>Otel</Text>
              <View style={s.hotelChips}>
                {hotels.map((h) => (
                  <Pressable key={h.id} onPress={() => setForm((f) => ({ ...f, hotel_id: h.id }))} style={[s.chip, form.hotel_id === h.id && s.chipActive]}>
                    <Text style={[s.chipText, form.hotel_id === h.id && s.chipTextActive]}>{h.hotel_name}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput testID="manager-name-input" placeholder="Manager adı" placeholderTextColor={COLORS.onSurfaceTertiary} value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} style={s.input} />
              <TextInput testID="manager-email-input" placeholder="Kullanıcı adı / e-posta" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" value={form.email} onChangeText={(email) => setForm((f) => ({ ...f, email }))} style={s.input} />
              <TextInput testID="manager-password-input" placeholder="Şifre" placeholderTextColor={COLORS.onSurfaceTertiary} secureTextEntry value={form.password} onChangeText={(password) => setForm((f) => ({ ...f, password }))} style={s.input} />
              <Pressable testID="create-manager-button" disabled={busy === "create"} onPress={createManager} style={s.primaryBtn}>
                <Text style={s.primaryText}>{busy === "create" ? "Oluşturuluyor..." : "Manager Oluştur"}</Text>
              </Pressable>
            </View>
          </View>
        )}
        data={managers}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Henüz manager yok</Text>}
        renderItem={({ item }) => {
          const isEditing = editing?.id === item.id;
          return (
            <View style={s.card} testID={`manager-${item.id}`}>
              {isEditing ? (
                <>
                  <TextInput value={editing.name} onChangeText={(name) => setEditing((e) => e && { ...e, name })} style={s.input} />
                  <TextInput value={editing.email} onChangeText={(email) => setEditing((e) => e && { ...e, email })} style={s.input} autoCapitalize="none" />
                  <View style={s.hotelChips}>
                    {hotels.map((h) => (
                      <Pressable key={h.id} onPress={() => setEditing((e) => e && { ...e, hotel_id: h.id })} style={[s.chip, editing.hotel_id === h.id && s.chipActive]}>
                        <Text style={[s.chipText, editing.hotel_id === h.id && s.chipTextActive]}>{h.hotel_name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.actions}>
                    <Pressable onPress={saveEdit} style={s.actionBtn}><Text style={s.actionText}>Kaydet</Text></Pressable>
                    <Pressable onPress={() => setEditing(null)} style={s.actionBtn}><Text style={s.actionText}>İptal</Text></Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{item.name}</Text>
                      <Text style={s.meta}>{item.email} · {hotelName(item.hotel_id ?? item.hotelId)}</Text>
                    </View>
                    <Text style={[s.badge, (item.active ?? true) ? s.active : s.inactive]}>{(item.active ?? true) ? "Aktif" : "Pasif"}</Text>
                  </View>
                  <View style={s.actions}>
                    <Pressable onPress={() => setEditing({ id: item.id, name: item.name, email: item.email, hotel_id: item.hotel_id ?? item.hotelId ?? "" })} style={s.actionBtn}>
                      <Ionicons name="create" size={16} color={COLORS.brand} />
                      <Text style={s.actionText}>Düzenle</Text>
                    </Pressable>
                    <Pressable onPress={() => toggleManager(item)} disabled={busy === item.id} style={s.actionBtn}>
                      <Ionicons name={(item.active ?? true) ? "pause-circle" : "play-circle"} size={16} color={COLORS.brand} />
                      <Text style={s.actionText}>{(item.active ?? true) ? "Disable" : "Enable"}</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteManager(item)} disabled={busy === item.id} style={s.actionBtn}>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, gap: SPACING.md },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary },
  form: { gap: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  input: { backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  hotelChips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  chipTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  primaryBtn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center" },
  primaryText: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 13 },
  list: { paddingBottom: SPACING.xl2 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.lg },
  card: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  name: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  badge: { overflow: "hidden", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  active: { backgroundColor: COLORS.success, color: COLORS.surface },
  inactive: { backgroundColor: COLORS.surfaceTertiary, color: COLORS.onSurfaceSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
});
