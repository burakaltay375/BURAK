import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE } from "@/src/theme";

type Stats = {
  total: number; active: number; completed: number; urgent: number;
  by_department: Record<string, { name: string; active: number }>;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const load = useCallback(async () => { try { setStats(await api.adminStats()); } catch {} }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  if (!stats) return <SafeAreaView style={s.root}><ActivityIndicator color={COLORS.brand} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="admin-dashboard-screen">
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Operasyon Merkezi</Text>
        <Text style={s.sub}>Genel bakış · Canlı veri</Text>

        <View style={s.metricsGrid}>
          <Metric label="Toplam Talep" value={stats.total} accent={COLORS.onSurface} testID="metric-total" />
          <Metric label="Aktif" value={stats.active} accent={COLORS.brand} testID="metric-active" />
          <Metric label="Tamamlanan" value={stats.completed} accent={COLORS.success} testID="metric-completed" />
          <Metric label="Acil" value={stats.urgent} accent={COLORS.error} testID="metric-urgent" />
        </View>

        <Text style={s.section}>Departman Yükü</Text>
        <View style={s.deptList}>
          {Object.entries(stats.by_department).map(([code, d]) => (
            <View key={code} style={s.deptRow} testID={`dept-load-${code}`}>
              <Text style={s.deptName}>{d.name}</Text>
              <View style={s.deptBarWrap}>
                <View style={[s.deptBar, { width: `${Math.min(100, d.active * 20)}%` }]} />
              </View>
              <Text style={s.deptCount}>{d.active}</Text>
            </View>
          ))}
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl2 },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  sub: { fontSize: 13, color: COLORS.onSurfaceTertiary, marginBottom: SPACING.md },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  metric: { width: "47%", backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.xs },
  metricValue: { fontSize: 36, fontWeight: "800", fontFamily: TYPE.display },
  metricLabel: { color: COLORS.onSurfaceTertiary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  section: { color: COLORS.onSurface, fontSize: 18, fontWeight: "700", marginTop: SPACING.lg, fontFamily: TYPE.display },
  deptList: { gap: SPACING.sm },
  deptRow: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.md, flexDirection: "row", alignItems: "center", gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  deptName: { color: COLORS.onSurfaceSecondary, fontSize: 13, width: 110 },
  deptBarWrap: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.surfaceTertiary, overflow: "hidden" },
  deptBar: { height: "100%", backgroundColor: COLORS.brand },
  deptCount: { color: COLORS.brand, fontSize: 14, fontWeight: "700", width: 24, textAlign: "right" },
});
