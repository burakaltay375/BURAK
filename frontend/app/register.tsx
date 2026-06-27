import { useEffect, useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { COLORS, SPACING, RADIUS, TYPE, DEPT_LABEL } from "@/src/theme";

type Role = "guest" | "staff" | "admin";

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<Role>("guest");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [room, setRoom] = useState("");
  const [department, setDepartment] = useState<string>("kuru_temizleme");
  const [depts, setDepts] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.departments().then(setDepts).catch(() => {}); }, []);

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const u = await signUp({
        email: email.trim(), password, name: name.trim(), role,
        ...(role === "staff" ? { department } : {}),
        ...(role === "guest" ? { room_no: room } : {}),
      });
      if (u.role === "guest") router.replace("/(guest)/chat");
      else if (u.role === "staff") router.replace("/(staff)/queue");
      else router.replace("/(admin)/dashboard");
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  return (
    <View style={s.root} testID="register-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} testID="register-back-button" style={s.backBtn}>
            <Text style={s.back}>‹ Geri</Text>
          </Pressable>
          <Text style={s.title}>Kayıt Ol</Text>
          <Text style={s.subtitle}>Hesabınızı oluşturun</Text>

          <View style={s.rolesRow}>
            {(["guest", "staff", "admin"] as Role[]).map((r) => (
              <Pressable
                key={r}
                testID={`register-role-${r}`}
                onPress={() => setRole(r)}
                style={[s.roleChip, role === r && s.roleChipActive]}
              >
                <Text style={[s.roleText, role === r && s.roleTextActive]}>
                  {r === "guest" ? "Misafir" : r === "staff" ? "Personel" : "Yönetici"}
                </Text>
              </Pressable>
            ))}
          </View>

          {err && <Text style={s.err} testID="register-error">{err}</Text>}

          <TextInput testID="register-name-input" placeholder="Adınız" placeholderTextColor={COLORS.onSurfaceTertiary} value={name} onChangeText={setName} style={s.input} />
          <TextInput testID="register-email-input" placeholder="E-posta" placeholderTextColor={COLORS.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={s.input} />
          <TextInput testID="register-password-input" placeholder="Şifre" placeholderTextColor={COLORS.onSurfaceTertiary} secureTextEntry value={password} onChangeText={setPassword} style={s.input} />

          {role === "guest" && (
            <TextInput testID="register-room-input" placeholder="Oda Numarası (örn. 204)" placeholderTextColor={COLORS.onSurfaceTertiary} value={room} onChangeText={setRoom} style={s.input} keyboardType="numeric" />
          )}

          {role === "staff" && (
            <View style={s.deptList}>
              <Text style={s.label}>Departman</Text>
              {(depts.length ? depts : Object.keys(DEPT_LABEL).map(c => ({ code: c, name: DEPT_LABEL[c] }))).map((d) => (
                <Pressable
                  key={d.code}
                  testID={`register-dept-${d.code}`}
                  onPress={() => setDepartment(d.code)}
                  style={[s.deptRow, department === d.code && s.deptRowActive]}
                >
                  <Text style={[s.deptText, department === d.code && s.deptTextActive]}>{d.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable testID="register-submit-button" onPress={submit} disabled={loading} style={({ pressed }) => [s.btn, pressed && s.btnPressed]}>
            {loading ? <ActivityIndicator color={COLORS.onBrandPrimary} /> : <Text style={s.btnText}>Kayıt Ol</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { padding: SPACING.xl, paddingTop: SPACING.xl2 + SPACING.xl, gap: SPACING.md },
  backBtn: { alignSelf: "flex-start", paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  back: { color: COLORS.brand, fontSize: 16 },
  title: { fontSize: 28, color: COLORS.onSurface, fontFamily: TYPE.display, fontWeight: "700" },
  subtitle: { fontSize: 14, color: COLORS.onSurfaceSecondary, marginBottom: SPACING.md },
  rolesRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  roleChip: { flex: 1, paddingVertical: SPACING.md, alignItems: "center", borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  roleChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  roleText: { color: COLORS.onSurfaceSecondary, fontSize: 14 },
  roleTextActive: { color: COLORS.onBrandPrimary, fontWeight: "700" },
  input: { backgroundColor: COLORS.surfaceSecondary, color: COLORS.onSurface, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  label: { color: COLORS.onSurfaceSecondary, marginBottom: SPACING.sm, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  deptList: { gap: SPACING.sm },
  deptRow: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  deptRowActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  deptText: { color: COLORS.onSurfaceSecondary, fontSize: 14 },
  deptTextActive: { color: COLORS.onBrandTertiary, fontWeight: "700" },
  btn: { backgroundColor: COLORS.brand, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, alignItems: "center", marginTop: SPACING.md },
  btnPressed: { opacity: 0.85 },
  btnText: { color: COLORS.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  err: { color: COLORS.error, fontSize: 14 },
});
