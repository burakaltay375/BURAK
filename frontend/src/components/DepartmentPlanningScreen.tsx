import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type DepartmentSchedule, type User } from "@/src/api";
import { useAuth } from "@/src/auth";
import { COLORS, DEPT_LABEL, RADIUS, SPACING, TYPE } from "@/src/theme";

const DEPARTMENTS = Object.entries(DEPT_LABEL);
const today = () => new Date().toISOString().slice(0, 10);

type Props = { manager: boolean };
type FormState = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  task: string;
  status: DepartmentSchedule["status"];
  note: string;
  repeat_weekdays: number[];
  repeat_until: string;
};

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const emptyForm = (): FormState => ({
  employee_id: "",
  date: today(),
  start_time: "09:00",
  end_time: "17:00",
  task: "Vardiya",
  status: "Draft",
  note: "",
  repeat_weekdays: [],
  repeat_until: "",
});

export default function DepartmentPlanningScreen({ manager }: Props) {
  const { user } = useAuth();
  const ownDepartment = user?.department ?? "";
  const position = (user?.position ?? "").toLocaleLowerCase("tr-TR");
  const canEdit = manager
    || position.includes("supervisor")
    || position.includes("manager")
    || position.includes("müdür")
    || position.includes("mudur");
  const [department, setDepartment] = useState(manager ? "all" : ownDepartment);
  const [plans, setPlans] = useState<DepartmentSchedule[] | null>(null);
  const [staff, setStaff] = useState<User[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const departmentFilter = department === "all" ? undefined : department;
  const load = useCallback(async () => {
    const [planRows, staffRows] = await Promise.all([
      api.listSchedules({ department: departmentFilter }),
      api.planningStaff(departmentFilter),
    ]);
    setPlans(planRows);
    setStaff(staffRows);
  }, [departmentFilter]);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setError(e.message);
      setPlans([]);
    });
  }, [load]));

  const groups = useMemo(() => {
    const result = new Map<string, DepartmentSchedule[]>();
    for (const plan of plans ?? []) {
      const rows = result.get(plan.date) ?? [];
      rows.push(plan);
      result.set(plan.date, rows);
    }
    return [...result.entries()];
  }, [plans]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const save = async () => {
    if (!form.employee_id) {
      setError("Personel seçimi zorunludur.");
      return;
    }
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...form,
        task: form.task.trim(),
        repeat_until: form.repeat_weekdays.length ? form.repeat_until : undefined,
        department: departmentFilter,
      };
      if (editingId) {
        await api.updateSchedule(editingId, payload);
        setNotice("Vardiya güncellendi.");
      } else {
        await api.createSchedule(payload);
        setNotice("Yeni plan oluşturuldu.");
      }
      resetForm();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const edit = (plan: DepartmentSchedule) => {
    if (manager && department === "all") setDepartment(plan.department);
    setForm({
      employee_id: plan.employee_id,
      date: plan.date,
      start_time: plan.start_time,
      end_time: plan.end_time,
      task: plan.task,
      status: plan.status,
      note: plan.note ?? "",
      repeat_weekdays: [],
      repeat_until: "",
    });
    setEditingId(plan.id);
    setShowForm(true);
  };

  const remove = (plan: DepartmentSchedule) => {
    Alert.alert("Plan silinsin mi?", `${plan.employee_name} için ${plan.date} tarihli plan silinecek.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setBusy(plan.id);
          setError(null);
          try {
            await api.deleteSchedule(plan.id);
            await load();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const approve = async (plan: DepartmentSchedule) => {
    setBusy(plan.id);
    setError(null);
    try {
      await api.approveSchedule(plan.id);
      setNotice("Plan onaylandı.");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const exportExcel = async () => {
    setBusy("export");
    setError(null);
    try {
      await api.exportSchedules({ department: departmentFilter });
      setNotice("Excel dosyası oluşturuldu.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const planCard = (plan: DepartmentSchedule) => {
    const isPast = plan.date < today();
    return (
      <View key={plan.id} style={s.card}>
        <View style={s.cardTop}>
          <View style={s.flex}>
            <Text style={s.cardTitle}>{plan.employee_name}</Text>
            <Text style={s.meta}>{DEPT_LABEL[plan.department] ?? plan.department} · {plan.position || "Personel"}</Text>
          </View>
          <View style={[s.badge, ["Approved", "ONAYLANDI"].includes(plan.status) ? s.approved : s.draft]}>
            <Text style={s.badgeText}>{["Approved", "ONAYLANDI"].includes(plan.status) ? "Onaylandı" : plan.status}</Text>
          </View>
        </View>
        <Text style={s.time}>{plan.date} · {plan.start_time}–{plan.end_time}{isPast ? " · Geçmiş" : ""}</Text>
        {!!plan.note && <Text style={s.task}>{plan.note}</Text>}
        {canEdit && <View style={s.actions}>
          <Pressable onPress={() => edit(plan)} disabled={busy === plan.id} style={s.secondaryButton}>
              <Ionicons name="create-outline" size={17} color={COLORS.brand} />
              <Text style={s.secondaryText}>Düzenle</Text>
            </Pressable>
          {manager && !["Approved", "ONAYLANDI"].includes(plan.status) && (
            <Pressable onPress={() => approve(plan)} disabled={busy === plan.id} style={s.secondaryButton}>
              <Ionicons name="checkmark-circle-outline" size={17} color={COLORS.success} />
              <Text style={[s.secondaryText, { color: COLORS.success }]}>Onayla</Text>
            </Pressable>
          )}
          <Pressable onPress={() => remove(plan)} disabled={busy === plan.id} style={s.secondaryButton}>
            <Ionicons name="trash-outline" size={17} color={COLORS.error} />
            <Text style={[s.secondaryText, { color: COLORS.error }]}>Sil</Text>
          </Pressable>
        </View>}
      </View>
    );
  };

  if (!plans) {
    return <View style={s.loading}><ActivityIndicator color={COLORS.brand} /></View>;
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Vardiya Yönetimi</Text>
      <Text style={s.subtitle}>
        {manager
          ? "Tüm departmanların vardiya ve görev planlarını yönetin."
          : canEdit
            ? `${DEPT_LABEL[ownDepartment] ?? ownDepartment} planlarını yönetin.`
            : `${DEPT_LABEL[ownDepartment] ?? ownDepartment} planlarını görüntüleyin. Değişiklik yetkiniz yoktur.`}
      </Text>
      {error && <Text style={s.error}>{error}</Text>}
      {notice && <Text style={s.notice}>{notice}</Text>}

      {manager && (
        <View style={s.chips}>
          {[["all", "Tümü"], ...DEPARTMENTS].map(([code, label]) => (
            <Pressable key={code} onPress={() => { setDepartment(code); resetForm(); }} style={[s.chip, department === code && s.chipActive]}>
              <Text style={[s.chipText, department === code && s.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {canEdit && <View style={s.toolbar}>
        <Pressable onPress={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()); }} style={s.primaryButton}>
          <Ionicons name="add" size={18} color={COLORS.onBrandPrimary} />
          <Text style={s.primaryText}>Yeni Vardiya</Text>
        </Pressable>
        <Pressable onPress={exportExcel} disabled={busy === "export"} style={s.exportButton}>
          <Ionicons name="document-outline" size={18} color={COLORS.brand} />
          <Text style={s.secondaryText}>{busy === "export" ? "Hazırlanıyor..." : "Excel'e Aktar"}</Text>
        </Pressable>
      </View>}

      {showForm && (
        <View style={s.form}>
          <Text style={s.formTitle}>{editingId ? "Vardiyayı Düzenle" : "Yeni Vardiya"}</Text>
          <Text style={s.label}>Personel seç</Text>
          <View style={s.chips}>
            {staff.map((employee) => (
              <Pressable key={employee.id} onPress={() => setForm((current) => ({ ...current, employee_id: employee.id }))} style={[s.chip, form.employee_id === employee.id && s.chipActive]}>
                <Text style={[s.chipText, form.employee_id === employee.id && s.chipTextActive]}>{employee.name}</Text>
              </Pressable>
            ))}
          </View>
          {!staff.length && <Text style={s.meta}>Bu departmanda aktif personel bulunamadı.</Text>}
          <TextInput value={form.date} onChangeText={(date) => setForm((current) => ({ ...current, date }))} placeholder="Tarih (YYYY-MM-DD)" placeholderTextColor={COLORS.onSurfaceTertiary} style={s.input} />
          <View style={s.timeRow}>
            <TextInput value={form.start_time} onChangeText={(start_time) => setForm((current) => ({ ...current, start_time }))} placeholder="Başlangıç (HH:MM)" placeholderTextColor={COLORS.onSurfaceTertiary} style={[s.input, s.flex]} />
            <TextInput value={form.end_time} onChangeText={(end_time) => setForm((current) => ({ ...current, end_time }))} placeholder="Bitiş (HH:MM)" placeholderTextColor={COLORS.onSurfaceTertiary} style={[s.input, s.flex]} />
          </View>
          {manager && <>
            <Text style={s.label}>Durum</Text>
            <View style={s.chips}>
              {([["Draft", "Planlandı"], ["Approved", "Onaylandı"]] as const).map(([value, label]) => (
                <Pressable key={value} onPress={() => setForm((current) => ({ ...current, status: value }))} style={[s.chip, form.status === value && s.chipActive]}>
                  <Text style={[s.chipText, form.status === value && s.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </>}
          {!editingId && <>
            <Text style={s.label}>Tekrarlanan günler (isteğe bağlı)</Text>
            <View style={s.chips}>
              {WEEKDAYS.map((label, day) => {
                const selected = form.repeat_weekdays.includes(day);
                return (
                  <Pressable key={day} onPress={() => setForm((current) => ({
                    ...current,
                    repeat_weekdays: selected
                      ? current.repeat_weekdays.filter((value) => value !== day)
                      : [...current.repeat_weekdays, day],
                  }))} style={[s.chip, selected && s.chipActive]}>
                    <Text style={[s.chipText, selected && s.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!!form.repeat_weekdays.length && (
              <TextInput value={form.repeat_until} onChangeText={(repeat_until) => setForm((current) => ({ ...current, repeat_until }))} placeholder="Tekrar bitiş tarihi (YYYY-MM-DD)" placeholderTextColor={COLORS.onSurfaceTertiary} style={s.input} />
            )}
          </>}
          <TextInput value={form.note} onChangeText={(note) => setForm((current) => ({ ...current, note }))} placeholder="Vardiya notu (isteğe bağlı)" placeholderTextColor={COLORS.onSurfaceTertiary} multiline style={[s.input, s.multiline]} />
          <View style={s.actions}>
            <Pressable onPress={save} disabled={busy === "save"} style={s.primaryButton}><Text style={s.primaryText}>{busy === "save" ? "Kaydediliyor..." : "Kaydet"}</Text></Pressable>
            <Pressable onPress={resetForm} style={s.secondaryButton}><Text style={s.secondaryText}>İptal</Text></Pressable>
          </View>
        </View>
      )}

      <View style={s.viewSwitch}>
        {(["list", "calendar"] as const).map((mode) => (
          <Pressable key={mode} onPress={() => setViewMode(mode)} style={[s.viewButton, viewMode === mode && s.viewButtonActive]}>
            <Ionicons name={mode === "list" ? "list" : "calendar-outline"} size={17} color={viewMode === mode ? COLORS.onBrandPrimary : COLORS.brand} />
            <Text style={[s.viewText, viewMode === mode && s.viewTextActive]}>{mode === "list" ? "Liste" : "Takvim"}</Text>
          </Pressable>
        ))}
      </View>

      {!plans.length && <Text style={s.empty}>Henüz plan oluşturulmadı.</Text>}
      {viewMode === "list"
        ? plans.map(planCard)
        : groups.map(([date, rows]) => (
          <View key={date} style={s.dayGroup}>
            <Text style={s.dayTitle}>{date}</Text>
            {rows.map(planCard)}
          </View>
        ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl2, gap: SPACING.md },
  title: { color: COLORS.onSurface, fontSize: 28, fontWeight: "700", fontFamily: TYPE.display },
  subtitle: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  error: { color: COLORS.error, fontSize: 13 },
  notice: { color: COLORS.success, fontSize: 13, fontWeight: "700" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xs, backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  primaryText: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  exportButton: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.brand, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  form: { gap: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  formTitle: { color: COLORS.onSurface, fontSize: 17, fontWeight: "700", fontFamily: TYPE.display },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  timeRow: { flexDirection: "row", gap: SPACING.sm },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  chip: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { color: COLORS.onSurfaceSecondary, fontSize: 12 },
  chipTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  viewSwitch: { flexDirection: "row", gap: SPACING.xs },
  viewButton: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  viewButtonActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  viewText: { color: COLORS.brand, fontWeight: "700", fontSize: 12 },
  viewTextActive: { color: COLORS.onBrandPrimary },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  cardTitle: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700" },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  time: { color: COLORS.brand, fontSize: 13, fontWeight: "700" },
  task: { color: COLORS.onSurfaceSecondary, fontSize: 14 },
  badge: { borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  approved: { backgroundColor: COLORS.success },
  draft: { backgroundColor: COLORS.surfaceTertiary },
  badgeText: { color: COLORS.surface, fontSize: 10, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  secondaryButton: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  secondaryText: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
  dayGroup: { gap: SPACING.sm, paddingTop: SPACING.sm },
  dayTitle: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.xl },
});
