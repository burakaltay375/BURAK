import { useCallback, useMemo, useState } from "react";
import { Alert, ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type User } from "@/src/api";
import { COLORS, DEPT_LABEL, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function AdminStaff() {
  const [staff, setStaff] = useState<User[] | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    position: "",
    work_area: "",
    responsibility_description: "",
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
        position: form.position.trim(),
        work_area: form.work_area.trim(),
        responsibility_description: form.responsibility_description.trim(),
      });
      setNotice(`${created.name} çalışan olarak oluşturuldu.`);
      setForm({
        name: "",
        email: "",
        password: "",
        position: "",
        work_area: "",
        responsibility_description: "",
      });
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
        position: editing.position?.trim() ?? "",
        work_area: editing.work_area?.trim() ?? "",
        responsibility_description: editing.responsibility_description?.trim() ?? "",
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
              <Text style={s.label}>Görev / Pozisyon</Text>
              <TextInput
                testID="staff-position-input"
                placeholder="Örn. Kat Görevlisi"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.position}
                onChangeText={(position) => setForm((f) => ({ ...f, position }))}
                style={s.input}
              />
              <Text style={s.label}>Çalışma Alanı</Text>
              <TextInput
                testID="staff-work-area-input"
                placeholder="Örn. West Block"
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.work_area}
                onChangeText={(work_area) => setForm((f) => ({ ...f, work_area }))}
                style={s.input}
              />
              <Text style={s.label}>Görev Alanı / Sorumluluk Tanımı</Text>
              <TextInput
                testID="staff-responsibility-input"
                placeholder="Örn. West Block'un 2300'lü odalarının temizliği ve kat hizmetlerinden sorumludur."
                placeholderTextColor={COLORS.onSurfaceTertiary}
                value={form.responsibility_description}
                onChangeText={(responsibility_description) => setForm((f) => ({ ...f, responsibility_description }))}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[s.input, s.textArea]}
              />
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
                  <Text style={s.label}>Görev / Pozisyon</Text>
                  <TextInput value={editing.position ?? ""} onChangeText={(position) => setEditing((e) => e && { ...e, position })} style={s.input} placeholder="Örn. Kat Görevlisi" placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <Text style={s.label}>Çalışma Alanı</Text>
                  <TextInput value={editing.work_area ?? ""} onChangeText={(work_area) => setEditing((e) => e && { ...e, work_area })} style={s.input} placeholder="Örn. West Block" placeholderTextColor={COLORS.onSurfaceTertiary} />
                  <Text style={s.label}>Görev Alanı / Sorumluluk Tanımı</Text>
                  <TextInput
                    value={editing.responsibility_description ?? ""}
                    onChangeText={(responsibility_description) => setEditing((e) => e && { ...e, responsibility_description })}
                    style={[s.input, s.textArea]}
                    placeholder="Personelin sorumlu olduğu blok, oda, restoran veya masaları yazın"
                    placeholderTextColor={COLORS.onSurfaceTertiary}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
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
                      <Text style={s.meta}>Görev: {item.position || "Belirtilmemiş"}</Text>
                      <Text style={s.meta}>Çalışma alanı: {item.work_area || "Belirtilmemiş"}</Text>
                      <Text style={s.meta}>Sorumluluk: {item.responsibility_description || "Belirtilmemiş"}</Text>
                      <Text style={s.meta}>Operasyon grubu: {DEPT_LABEL[item.department ?? ""] ?? item.department}</Text>
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
  textArea: { minHeight: 110 },
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
