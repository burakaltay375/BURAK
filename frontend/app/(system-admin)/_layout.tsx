import { Tabs } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import { RoleGate } from "@/src/role-guard";
import { HospiraMark } from "@/src/components/HospiraBrand";
import IdleIntroBackground from "@/src/components/IdleIntroBackground";

import { COLORS } from "@/src/theme";



export default function SystemAdminLayout() {

  return (

    <RoleGate role="system_admin">

      <IdleIntroBackground homePath="/dashboard">
      <Tabs

        screenOptions={{

          headerShown: false,
          sceneStyle: { backgroundColor: "transparent" },

          tabBarActiveTintColor: COLORS.brand,

          tabBarInactiveTintColor: COLORS.onSurfaceTertiary,

          tabBarStyle: { backgroundColor: COLORS.surfaceSecondary, borderTopColor: COLORS.border, height: 64, paddingBottom: 8, paddingTop: 6 },

          tabBarLabelStyle: { fontSize: 11 },

        }}

      >

        <Tabs.Screen name="dashboard" options={{ title: "Sistem", tabBarIcon: ({ size }) => <HospiraMark size={size} /> }} />

        <Tabs.Screen name="hotels" options={{ title: "Oteller", tabBarIcon: ({ color, size }) => <Ionicons name="business" color={color} size={size} /> }} />

        <Tabs.Screen name="managers" options={{ title: "Manager", tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />

        <Tabs.Screen name="ai-knowledge" options={{ href: null }} />

        <Tabs.Screen name="users" options={{ title: "Kullanıcı", tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />

        <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />

      </Tabs>
      </IdleIntroBackground>

    </RoleGate>

  );

}

