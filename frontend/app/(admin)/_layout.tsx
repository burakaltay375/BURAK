import { Tabs } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import { RoleGate } from "@/src/role-guard";

import { COLORS } from "@/src/theme";



export default function AdminLayout() {

  return (

    <RoleGate role="hotel_manager">

      <Tabs

        screenOptions={{

          headerShown: false,

          tabBarActiveTintColor: COLORS.brand,

          tabBarInactiveTintColor: COLORS.onSurfaceTertiary,

          tabBarStyle: { backgroundColor: COLORS.surfaceSecondary, borderTopColor: COLORS.border, height: 64, paddingBottom: 8, paddingTop: 6 },

          tabBarLabelStyle: { fontSize: 11 },

        }}

      >

        <Tabs.Screen name="dashboard" options={{ title: "Panel", tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} /> }} />

        <Tabs.Screen name="reservations" options={{ title: "Rezervasyon", tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }} />

        <Tabs.Screen name="all-requests" options={{ title: "Talepler", tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} /> }} />

        <Tabs.Screen name="staff" options={{ title: "Çalışanlar", tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />

        <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />

      </Tabs>

    </RoleGate>

  );

}

