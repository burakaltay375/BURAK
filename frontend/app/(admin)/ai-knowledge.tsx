import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, type HotelAiKnowledgeInput } from "@/src/api";
import { AiKnowledgePanel, emptyAiKnowledgeInput, toAiKnowledgeInput } from "@/src/components/AiKnowledgePanel";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function ManagerAiKnowledge() {
  const [form, setForm] = useState<HotelAiKnowledgeInput | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.managerAiKnowledge();
      setForm(toAiKnowledgeInput(data));
      setUpdatedAt(data.updated_at ?? null);
      setErr(null);
    } catch (e: any) {
      setForm(emptyAiKnowledgeInput);
      setErr(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErr(null);
    try {
      const saved = await api.saveManagerAiKnowledge(form);
      setForm(toAiKnowledgeInput(saved));
      setUpdatedAt(saved.updated_at ?? null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    Alert.alert("Bilgi tabanı temizlensin mi?", "Bu işlem otelinizin AI bilgi tabanı içeriğini siler.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Temizle",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api.deleteManagerAiKnowledge();
            await load();
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (!form) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="manager-ai-knowledge-screen">
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>Otel Bilgileri ve Kuralları</Text>
          <Text style={s.sub}>Buraya kaydettiğiniz otel bilgileri ve kurallar, AI resepsiyonun misafirlere verdiği yanıtlarda kaynak olarak kullanılır. Bilgi girilmeyen konularda AI tahmin yürütmez.</Text>
          {updatedAt && <Text style={s.meta}>Son güncelleme: {new Date(updatedAt).toLocaleString("tr-TR")}</Text>}
          {err && <Text style={s.err}>{err}</Text>}
          <View style={s.actions}>
            <Pressable onPress={save} disabled={busy} style={[s.primaryBtn, busy && s.disabled]}>
              <Ionicons name="save" size={17} color={COLORS.onBrandPrimary} />
              <Text style={s.primaryText}>{busy ? "Kaydediliyor" : "Kaydet"}</Text>
            </Pressable>
            <Pressable onPress={reset} disabled={busy} style={s.ghostBtn}>
              <Ionicons name="trash" size={17} color={COLORS.error} />
              <Text style={s.ghostText}>Temizle</Text>
            </Pressable>
          </View>
        </View>
        <AiKnowledgePanel value={form} editable onChange={setForm} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 110 },
  header: { gap: SPACING.sm },
  title: { color: COLORS.onSurface, fontSize: 28, fontFamily: TYPE.display, fontWeight: "800" },
  sub: { color: COLORS.onSurfaceSecondary, lineHeight: 21 },
  meta: { color: COLORS.onSurfaceTertiary, fontSize: 12 },
  err: { color: COLORS.error, fontWeight: "700" },
  actions: { flexDirection: "row", gap: SPACING.md, flexWrap: "wrap", marginTop: SPACING.sm },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.brand, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  primaryText: { color: COLORS.onBrandPrimary, fontWeight: "900" },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  ghostText: { color: COLORS.onSurfaceSecondary, fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
