import { useCallback, useMemo, useState } from "react";
import { Alert, ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type User } from "@/src/api";
import { COLORS, DEPT_LABEL, RADIUS, SPACING, TYPE } from "@/src/theme";

const DEPARTMENTS = Object.entries(DEPT_LABEL);
const isManagerPosition = (position?: string | null) => {
  const value = (position ?? "").toLocaleLowerCase("tr-TR");
  return value.includes("manager") || value.includes("supervisor") || value.includes("müdür") || value.includes("mudur");
};
const departmentPosition = (department: string, manager: boolean) =>
  `${DEPT_LABEL[department] ?? department} ${manager ? "Müdürü" : "Personel"}`;

export default function AdminStaff() {
  const [staff, setStaff] = useState<User[] | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: DEPARTMENTS[0]?.[0] ?? "",
    position: departmentPosition(DEPARTMENTS[0]?.[0] ?? "", false),
  });
  const [editing, setEditing] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    setBusy("create");
    try {
      const created = await api.createStaff({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        department: form.department,
        position: form.position.trim(),
      });
      setNotice(`${created.name} çalışan olarak oluşturuldu.`);
      setForm((f) => ({ ...f, name: "", email: "", password: "", position: departmentPosition(f.department, false) }));
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
    setNotice(null);
    setBusy(editing.id);
    try {
      await api.updateStaff(editing.id, {
        name: editing.name.trim(),
        department: editing.department ?? "",
        position: editing.position?.trim() ?? "",
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
    setNotice(null);
    setBusy(item.id);
    try {
      await api.updateStaff(item.id, { active: !(item.active ?? true) });
      setNotice(`${item.name} hesabı ${item.active === false ? "aktif" : "pasif"} yapıldı.`);
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
            {notice && <Text style={s.notice}>{notice}</Text>}

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
              <Text style={s.label}>Planlama yetkisi</Text>
              <View style={s.chips}>
                {[false, true].map((manager) => {
                  const selected = isManagerPosition(form.position) === manager;
                  return (
                    <Pressable key={String(manager)} onPress={() => setForm((f) => ({ ...f, position: departmentPosition(f.department, manager) }))} style={[s.chip, selected && s.chipActive]}>
                      <Text style={[s.chipText, selected && s.chipTextActive]}>{manager ? "Departman Müdürü" : "Personel"}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.label}>Departman</Text>
              <View style={s.chips}>
                {DEPARTMENTS.map(([code, label]) => (
                  <Pressable
                    key={code}
                    testID={`staff-department-${code}`}
                    onPress={() => setForm((f) => ({ ...f, department: code, position: departmentPosition(code, isManagerPosition(f.position)) }))}
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
                  <Text style={s.label}>Planlama yetkisi</Text>
                  <View style={s.chips}>
                    {[false, true].map((manager) => {
                      const selected = isManagerPosition(editing.position) === manager;
                      return (
                        <Pressable key={String(manager)} onPress={() => setEditing((e) => e && { ...e, position: departmentPosition(e.department ?? "", manager) })} style={[s.chip, selected && s.chipActive]}>
                          <Text style={[s.chipText, selected && s.chipTextActive]}>{manager ? "Departman Müdürü" : "Personel"}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={s.label}>Departman</Text>
                  <View style={s.chips}>
                    {DEPARTMENTS.map(([code, label]) => (
                      <Pressable key={code} onPress={() => setEditing((e) => e && { ...e, department: code, position: departmentPosition(code, isManagerPosition(e.position)) })} style={[s.chip, editing.department === code && s.chipActive]}>
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
                      <Text style={s.meta}>{item.position || "Pozisyon belirtilmemiş"}</Text>
                    </View>
                    <Text style={[s.badge, item.active === false ? s.inactive : s.active]}>
                      {item.active === false ? "Pasif" : "Aktif"}
                    </Text>
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
  notice: { color: COLORS.success, fontSize: 13, fontWeight: "700" },
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
  badge: { overflow: "hidden", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  active: { backgroundColor: COLORS.success, color: COLORS.surface },
  inactive: { backgroundColor: COLORS.surfaceTertiary, color: COLORS.onSurfaceSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
});
