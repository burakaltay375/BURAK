import { useCallback, useMemo, useState } from "react";
import { Alert, ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type User } from "@/src/api";
import { COLORS, DEPT_LABEL, RADIUS, SPACING, TYPE } from "@/src/theme";

const DEPARTMENTS = Object.entries(DEPT_LABEL);

export default function AdminStaff() {
  const [staff, setStaff] = useState<User[] | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: DEPARTMENTS[0]?.[0] ?? "",
    gender: "",
    birth_date: "",
    nationality: "",
    country: "",
    region_city: "",
  });
  const [editing, setEditing] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await api.listStaff();
    setStaff(rows);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setStaff([]);
    });
  }, [load]));

  const activeCount = useMemo(() => (staff ?? []).filter((u) => u.active !== false).length, [staff]);

  const createStaff = async () => {
    setErr(null);
    setBusy("create");
    try {
      await api.createStaff({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        department: form.department,
        gender: form.gender.trim(),
        birth_date: form.birth_date.trim(),
        nationality: form.nationality.trim(),
        country: form.country.trim(),
        region_city: form.region_city.trim(),
      });
      setForm((f) => ({ ...f, name: "", email: "", password: "", gender: "", birth_date: "", nationality: "", country: "", region_city: "" }));
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setErr(null);
    setBusy(editing.id);
    try {
      await api.updateStaff(editing.id, {
        name: editing.name.trim(),
        department: editing.department ?? "",
        gender: editing.gender?.trim() ?? "",
        birth_date: editing.birth_date?.trim() ?? "",
        nationality: editing.nationality?.trim() ?? "",
        country: editing.country?.trim() ?? "",
        region_city: editing.region_city?.trim() ?? "",
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const toggleStaff = async (item: User) => {
    setErr(null);
    setBusy(item.id);
    try {
      await api.updateStaff(item.id, { active: !(item.active ?? true) });
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const deleteStaff = async (item: User) => {
    Alert.alert("Çalışan silinsin mi?", `${item.name} hesabı otelinizden kaldırılacak.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setErr(null);
          setBusy(item.id);
          try {
            await api.deleteStaff(item.id);
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

  if (!staff) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-staff-screen">
      <FlatList
        ListHeaderComponent={(
          <View style={s.header}>
            <Text style={s.title}>Çalışanlar</Text>
            <Text style={s.sub}>{staff.length} çalışan · {activeCount} aktif · sadece atanmış otel</Text>
            {err && <Text style={s.err}>{err}</Text>}

            <View style={s.form}>
              <Text style={s.formTitle}>Yeni çalışan ekle</Text>
              <TextInput
                testID="staff-name-input"
                placeholder="Ad Soyad"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.name}
                onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                style={s.input}
              />
              <TextInput
                testID="staff-email-input"
                placeholder="E-posta"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                autoCapitalize="none"
                keyboardType="email-address"
                value={form.email}
                onChangeText={(email) => setForm((f) => ({ ...f, email }))}
                style={s.input}
              />
              <TextInput
                testID="staff-password-input"
                placeholder="Şifre"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                secureTextEntry
                value={form.password}
                onChangeText={(password) => setForm((f) => ({ ...f, password }))}
                style={s.input}
              />
              <TextInput
                testID="staff-gender-input"
                placeholder="Cinsiyet"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.gender}
                onChangeText={(gender) => setForm((f) => ({ ...f, gender }))}
                style={s.input}
              />
              <TextInput
                testID="staff-birth-date-input"
                placeholder="Doğum tarihi (YYYY-MM-DD)"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.birth_date}
                onChangeText={(birth_date) => setForm((f) => ({ ...f, birth_date }))}
                style={s.input}
              />
              <TextInput
                testID="staff-nationality-input"
                placeholder="Uyruk"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.nationality}
                onChangeText={(nationality) => setForm((f) => ({ ...f, nationality }))}
                style={s.input}
              />
              <TextInput
                testID="staff-country-input"
                placeholder="Ülke"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.country}
                onChangeText={(country) => setForm((f) => ({ ...f, country }))}
                style={s.input}
              />
              <TextInput
                testID="staff-region-city-input"
                placeholder="Bölge / Şehir"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.region_city}
                onChangeText={(region_city) => setForm((f) => ({ ...f, region_city }))}
                style={s.input}
              />
              <Text style={s.label}>Departman</Text>
              <View style={s.chips}>
                {DEPARTMENTS.map(([code, label]) => (
                  <Pressable
                    key={code}
                    testID={`staff-department-${code}`}
                    onPress={() => setForm((f) => ({ ...f, department: code }))}
                    style={[s.chip, form.department === code && s.chipActive]}
                  >
                    <Text style={[s.chipText, form.department === code && s.chipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                testID="create-staff-button"
                disabled={busy === "create"}
                onPress={createStaff}
                style={[s.primaryBtn, busy === "create" && s.disabled]}
              >
                <Text style={s.primaryText}>{busy === "create" ? "Ekleniyor..." : "Çalışan Ekle"}</Text>
              </Pressable>
            </View>
          </View>
        )}
        data={staff}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Henüz çalışan yok</Text>}
        renderItem={({ item }) => {
          const isEditing = editing?.id === item.id;
          return (
            <View style={s.card} testID={`staff-${item.id}`}>
              {isEditing && editing ? (
                <>
                  <TextInput value={editing.name} onChangeText={(name) => setEditing((e) => e && { ...e, name })} style={s.input} placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <TextInput value={editing.gender ?? ""} onChangeText={(gender) => setEditing((e) => e && { ...e, gender })} style={s.input} placeholder="Cinsiyet" placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <TextInput value={editing.birth_date ?? ""} onChangeText={(birth_date) => setEditing((e) => e && { ...e, birth_date })} style={s.input} placeholder="Doğum tarihi (YYYY-MM-DD)" placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <TextInput value={editing.nationality ?? ""} onChangeText={(nationality) => setEditing((e) => e && { ...e, nationality })} style={s.input} placeholder="Uyruk" placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <TextInput value={editing.country ?? ""} onChangeText={(country) => setEditing((e) => e && { ...e, country })} style={s.input} placeholder="Ülke" placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <TextInput value={editing.region_city ?? ""} onChangeText={(region_city) => setEditing((e) => e && { ...e, region_city })} style={s.input} placeholder="Bölge / Şehir" placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <Text style={s.label}>Departman</Text>
                  <View style={s.chips}>
                    {DEPARTMENTS.map(([code, label]) => (
                      <Pressable key={code} onPress={() => setEditing((e) => e && { ...e, department: code })} style={[s.chip, editing.department === code && s.chipActive]}>
                        <Text style={[s.chipText, editing.department === code && s.chipTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.actions}>
                    <Pressable onPress={saveEdit} disabled={busy === item.id} style={s.actionBtn}><Text style={s.actionText}>Kaydet</Text></Pressable>
                    <Pressable onPress={() => setEditing(null)} style={s.actionBtn}><Text style={s.actionText}>İptal</Text></Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{item.name}</Text>
                      <Text style={s.meta}>{item.email}</Text>
                      <Text style={s.meta}>{DEPT_LABEL[item.department ?? ""] ?? item.department}</Text>
                    </View>
                    <Text style={[s.badge, item.active === false ? s.inactive : s.active]}>
                      {item.active === false ? "Pasif" : "Aktif"}
                    </Text>
                  </View>
                  <View style={s.details}>
                    <Text style={s.detail}>Cinsiyet: {item.gender || "—"}</Text>
                    <Text style={s.detail}>Doğum: {item.birth_date || "—"} · Yaş: {item.age ?? "—"}</Text>
                    <Text style={s.detail}>Uyruk: {item.nationality || "—"}</Text>
                    <Text style={s.detail}>Konum: {[item.country, item.region_city].filter(Boolean).join(" / ") || "—"}</Text>
                  </View>
                  <View style={s.actions}>
                    <Pressable onPress={() => setEditing(item)} disabled={busy === item.id} style={s.actionBtn}>
                      <Ionicons name="create" size={16} color={COLORS.brand} />
                      <Text style={s.actionText}>Düzenle</Text>
                    </Pressable>
                    <Pressable onPress={() => toggleStaff(item)} disabled={busy === item.id} style={s.actionBtn}>
                      <Ionicons name={item.active === false ? "play-circle" : "pause-circle"} size={16} color={COLORS.brand} />
                      <Text style={s.actionText}>{item.active === false ? "Aktif Yap" : "Pasif Yap"}</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteStaff(item)} disabled={busy === item.id} style={s.actionBtn}>
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
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  err: { color: COLORS.error, fontSize: 13 },
  form: { gap: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  formTitle: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  input: { backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  chipTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  primaryBtn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center" },
  primaryText: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  disabled: { opacity: 0.65 },
  list: { paddingBottom: SPACING.xl2 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.lg },
  card: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  name: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  details: { gap: 4 },
  detail: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  badge: { overflow: "hidden", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  active: { backgroundColor: COLORS.success, color: COLORS.surface },
  inactive: { backgroundColor: COLORS.surfaceTertiary, color: COLORS.onSurfaceSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
});
