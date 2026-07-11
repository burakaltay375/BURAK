import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, type HotelAiKnowledgeInput } from "@/src/api";
import { AiKnowledgePanel, emptyAiKnowledgeInput, toAiKnowledgeInput } from "@/src/components/AiKnowledgePanel";
import { COLORS, SPACING, TYPE } from "@/src/theme";

export default function StaffAiKnowledge() {
  const [knowledge, setKnowledge] = useState<HotelAiKnowledgeInput | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.staffAiKnowledge();
      setKnowledge(toAiKnowledgeInput(data));
      setErr(null);
    } catch (e: any) {
      setKnowledge(emptyAiKnowledgeInput);
      setErr(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!knowledge) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="staff-ai-knowledge-screen">
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.title}>AI Knowledge Center</Text>
          <Text style={s.sub}>Otelinizin AI asistanında kullanılan bilgi tabanı. Bu ekran salt-okunurdur.</Text>
          {err && <Text style={s.err}>{err}</Text>}
        </View>
        <AiKnowledgePanel value={knowledge} />
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
  err: { color: COLORS.error, fontWeight: "700" },
});
