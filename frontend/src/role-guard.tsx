import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "./auth";
import type { Role } from "./api";
import { dashboardRouteForRole, normalizeRole } from "./roles";
import { COLORS } from "./theme";

type Props = {
  role: Role;
  children: ReactNode;
};

/** Blocks direct URL access unless the signed-in user has the required role. */
export function RoleGate({ role, children }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.surface }}>
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  if (normalizeRole(user.role) !== role) {
    return <Redirect href={dashboardRouteForRole(user.role)} />;
  }

  return <>{children}</>;
}
