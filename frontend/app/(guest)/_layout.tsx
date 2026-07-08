import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RoleGate } from "@/src/role-guard";
import { COLORS } from "@/src/theme";

export default function GuestLayout() {
  return (
    <RoleGate role="guest">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.brand,
          tabBarInactiveTintColor: COLORS.onSurfaceTertiary,
          tabBarStyle: {
            backgroundColor: COLORS.surfaceSecondary,
            borderTopColor: COLORS.border,
            height: 64, paddingBottom: 8, paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="chat"
          options={{
            title: "Konsiyerj",
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="requests"
          options={{
            title: "Taleplerim",
            tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="room"
          options={{
            title: "Odam",
            tabBarIcon: ({ color, size }) => <Ionicons name="bed" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="announcements"
          options={{
            title: "Duyurular",
            tabBarIcon: ({ color, size }) => <Ionicons name="megaphone" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profil",
            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
          }}
        />
      </Tabs>
    </RoleGate>
  );
}
