import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import HospiraBrand from "@/src/components/HospiraBrand";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

type Stats = {
  hotels: number;
  active_hotels: number;
  managers: number;
  staff: number;
  guests: number;
  users: number;
  requests: number;
  ai_messages: number;
};

type Usage = {
  messages: number;
  sessions: number;
  generated_requests: number;
};

export default function SystemDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, u] = await Promise.all([api.systemStats(), api.aiUsage()]);
    setStats(s);
    setUsage(u);
    setErr(null);
  }, []);

  useFocusEffect(useCallback(() => { load().catch((e) => setErr(e.message)); }, [load]));

  if (!stats || !usage) {
    return (
      <SafeAreaView style={s.root}>
        {err ? <Text style={s.err}>{err}</Text> : <ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="system-admin-dashboard-screen">
      <ScrollView contentContainerStyle={s.content}>
        <HospiraBrand compact />
        <Text style={s.title}>Sistem Yönetimi</Text>
        <Text style={s.sub}>Platform geneli · Sadece sistem yöneticisi</Text>

        <View style={s.metricsGrid}>
          <Metric label="Oteller" value={stats.hotels} accent={COLORS.brand} testID="system-metric-hotels" />
          <Metric label="Aktif Otel" value={stats.active_hotels} accent={COLORS.success} testID="system-metric-active-hotels" />
          <Metric label="Manager" value={stats.managers} accent={COLORS.onSurface} testID="system-metric-managers" />
          <Metric label="Staff" value={stats.staff} accent={COLORS.onSurfaceSecondary} testID="system-metric-staff" />
          <Metric label="Guest" value={stats.guests} accent={COLORS.warning} testID="system-metric-guests" />
          <Metric label="Kullanıcı" value={stats.users} accent={COLORS.onSurface} testID="system-metric-users" />
          <Metric label="Talep" value={stats.requests} accent={COLORS.onSurfaceSecondary} testID="system-metric-requests" />
          <Metric label="AI Mesaj" value={stats.ai_messages} accent={COLORS.brand} testID="system-metric-ai" />
        </View>

        <Text style={s.section}>AI Kullanımı</Text>
        <View style={s.panel}>
          <Row label="Mesaj" value={usage.messages} />
          <Row label="Oturum" value={usage.sessions} />
          <Row label="Oluşan Talep" value={usage.generated_requests} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, accent, testID }: { label: string; value: number; accent: string; testID: string }) {
  return (
    <View style={s.metric} testID={testID}>
      <Text style={[s.metricValue, { color: accent }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary, marginBottom: SPACING.md },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  metric: { width: "47%", backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.xs },
  metricValue: { fontSize: 34, fontWeight: "800", fontFamily: TYPE.display },
  metricLabel: { color: COLORS.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  section: { color: COLORS.onSurface, fontSize: 18, fontWeight: "700", marginTop: SPACING.lg, fontFamily: TYPE.display },
  panel: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: "row", justifyContent: "space-between", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLabel: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  rowValue: { color: COLORS.brand, fontSize: 15, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 14, padding: SPACING.lg },
});
