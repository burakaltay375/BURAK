import { Tabs } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import { RoleGate } from "@/src/role-guard";

import { COLORS } from "@/src/theme";



export default function SystemAdminLayout() {

  return (

    <RoleGate role="system_admin">

      <Tabs

        screenOptions={{

          headerShown: false,

          tabBarActiveTintColor: COLORS.brand,

          tabBarInactiveTintColor: COLORS.onSurfaceTertiary,

          tabBarStyle: { backgroundColor: COLORS.surfaceSecondary, borderTopColor: COLORS.border, height: 64, paddingBottom: 8, paddingTop: 6 },

          tabBarLabelStyle: { fontSize: 11 },

        }}

      >

        <Tabs.Screen name="dashboard" options={{ title: "Sistem", tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={color} size={size} /> }} />

        <Tabs.Screen name="hotels" options={{ title: "Oteller", tabBarIcon: ({ color, size }) => <Ionicons name="business" color={color} size={size} /> }} />

        <Tabs.Screen name="managers" options={{ title: "Manager", tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />

        <Tabs.Screen name="reservations" options={{ title: "Rezervasyon", tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }} />

        <Tabs.Screen name="users" options={{ title: "Kullanıcı", tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />

        <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />

      </Tabs>

    </RoleGate>

  );

}

