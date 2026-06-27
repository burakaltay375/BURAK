import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { COLORS } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "guest") router.replace("/(guest)/chat");
    else if (user.role === "staff") router.replace("/(staff)/queue");
    else router.replace("/(admin)/dashboard");
  }, [user, loading, router]);

  return (
    <View style={s.c} testID="splash-screen">
      <ActivityIndicator color={COLORS.brand} size="large" />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
});
