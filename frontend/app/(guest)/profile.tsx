import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { COLORS, SPACING, RADIUS, TYPE, DEPT_LABEL } from "@/src/theme";

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  if (!user) return null;

  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="profile-screen">
      <View style={s.header}>
        <Text style={s.title}>Profil</Text>
      </View>
      <View style={s.card}>
        <View style={s.avatar}><Ionicons name="person" size={36} color={COLORS.brand} /></View>
        <Text style={s.name}>{user.name}</Text>
        <Text style={s.email}>{user.email}</Text>
      </View>

      <View style={s.info}>
        <Row label="Rol" value={roleLabel(user.role)} />
        {user.room_no && <Row label="Oda" value={user.room_no} />}
        {user.department && <Row label="Departman" value={DEPT_LABEL[user.department] ?? user.department} />}
        {user.gender && <Row label="Cinsiyet" value={user.gender} />}
        {user.birth_date && <Row label="Doğum Tarihi" value={user.birth_date} />}
        {user.age !== undefined && user.age !== null && <Row label="Yaş" value={String(user.age)} />}
        {user.nationality && <Row label="Uyruk" value={user.nationality} />}
        {user.country && <Row label="Ülke" value={user.country} />}
        {user.region_city && <Row label="Bölge / Şehir" value={user.region_city} />}
      </View>

      <Pressable testID="logout-button" onPress={logout} style={s.logout}>
        <Ionicons name="log-out" size={20} color={COLORS.error} />
        <Text style={s.logoutText}>Çıkış Yap</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function roleLabel(role: string) {
  if (role === "system_admin") return "Sistem Yöneticisi";
  if (role === "hotel_manager") return "Hotel Manager";
  if (role === "staff") return "Personel";
  return "Misafir";
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface, padding: SPACING.lg },
  header: { marginBottom: SPACING.lg },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  card: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: COLORS.onSurface, fontSize: 20, fontWeight: "700", fontFamily: TYPE.display, marginTop: SPACING.sm },
  email: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  info: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLabel: { color: COLORS.onSurfaceTertiary, fontSize: 13 },
  rowValue: { color: COLORS.onSurface, fontSize: 14, fontWeight: "600" },
  logout: { marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, padding: SPACING.lg, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.error },
  logoutText: { color: COLORS.error, fontSize: 15, fontWeight: "700" },
});
