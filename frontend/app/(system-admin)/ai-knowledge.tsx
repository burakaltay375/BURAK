import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, type Hotel, type HotelAiKnowledgeInput } from "@/src/api";
import { AiKnowledgePanel, emptyAiKnowledgeInput, toAiKnowledgeInput } from "@/src/components/AiKnowledgePanel";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function SystemAiKnowledge() {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<HotelAiKnowledgeInput | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadHotels = useCallback(async () => {
    try {
      const data = await api.listHotels();
      setHotels(data);
      setSelectedHotelId((current) => current ?? data[0]?.id ?? null);
      setErr(null);
    } catch (e: any) {
      setHotels([]);
      setErr(e.message);
    }
  }, []);

  const loadKnowledge = useCallback(async (hotelId: string) => {
    try {
      const data = await api.systemAiKnowledge(hotelId);
      setKnowledge(toAiKnowledgeInput(data));
      setErr(null);
    } catch (e: any) {
      setKnowledge(emptyAiKnowledgeInput);
      setErr(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadHotels(); }, [loadHotels]));

  useEffect(() => {
    if (selectedHotelId) loadKnowledge(selectedHotelId);
  }, [loadKnowledge, selectedHotelId]);

  if (!hotels) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="system-ai-knowledge-screen">
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.title}>AI Knowledge Center</Text>
          <Text style={s.sub}>System admin tüm otellerin bilgi tabanını salt-okunur olarak görüntüler.</Text>
          {err && <Text style={s.err}>{err}</Text>}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hotelRow}>
          {hotels.map((hotel) => {
            const selected = selectedHotelId === hotel.id;
            return (
              <Pressable key={hotel.id} onPress={() => { setSelectedHotelId(hotel.id); setKnowledge(null); }} style={[s.hotelChip, selected && s.hotelChipActive]}>
                <Text style={[s.hotelChipText, selected && s.hotelChipTextActive]}>{hotel.hotel_name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!selectedHotelId && <Text style={s.empty}>Henüz otel yok</Text>}
        {selectedHotelId && !knowledge && <ActivityIndicator color={COLORS.brand} />}
        {knowledge && <AiKnowledgePanel value={knowledge} />}
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
  hotelRow: { gap: SPACING.sm },
  hotelChip: { borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.surfaceSecondary },
  hotelChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  hotelChipText: { color: COLORS.onSurfaceSecondary, fontWeight: "800" },
  hotelChipTextActive: { color: COLORS.onBrandPrimary },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", marginTop: SPACING.xl },
});
