import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RoleGate } from "@/src/role-guard";
import { COLORS } from "@/src/theme";

export default function StaffLayout() {
  return (
    <RoleGate role="staff">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.brand,
          tabBarInactiveTintColor: COLORS.onSurfaceTertiary,
          tabBarStyle: { backgroundColor: COLORS.surfaceSecondary, borderTopColor: COLORS.border, height: 64, paddingBottom: 8, paddingTop: 6 },
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tabs.Screen name="queue" options={{ title: "Kuyruk", tabBarIcon: ({ color, size }) => <Ionicons name="notifications" color={color} size={size} /> }} />
        <Tabs.Screen name="active" options={{ title: "Aktif İşler", tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" color={color} size={size} /> }} />
        <Tabs.Screen name="rooms" options={{ title: "Odalar", tabBarIcon: ({ color, size }) => <Ionicons name="bed" color={color} size={size} /> }} />
        <Tabs.Screen name="ai-knowledge" options={{ title: "AI Bilgi", tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" color={color} size={size} /> }} />
        <Tabs.Screen name="chat" options={{ title: "AI", tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses" color={color} size={size} /> }} />
        <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
      </Tabs>
    </RoleGate>
  );
}
