import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, Announcement } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

export default function GuestAnnouncements() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await api.announcements());
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch((e) => {
      setErr(e.message);
      setItems([]);
    });
  }, [load]));

  if (!items) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="guest-announcements-screen">
      <View style={s.header}>
        <Text style={s.title}>Duyurular</Text>
        <Text style={s.sub}>Otel bilgilendirmeleri</Text>
        {err && <Text style={s.err}>{err}</Text>}
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Aktif duyuru yok</Text>}
        renderItem={({ item }) => (
          <View style={s.card} testID={`announcement-${item.id}`}>
            <Text style={s.cardTitle}>{item.title}</Text>
            <Text style={s.message}>{item.message}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { color: COLORS.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  err: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },
  list: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  empty: { color: COLORS.onSurfaceTertiary, textAlign: "center", padding: SPACING.lg },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  cardTitle: { color: COLORS.brand, fontSize: 18, fontFamily: TYPE.display, fontWeight: "700" },
  message: { color: COLORS.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
});
