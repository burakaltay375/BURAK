import type { Href } from "expo-router";

import type { Role } from "./api";

const DASHBOARD_BY_ROLE: Record<Role, Href> = {
  system_admin: "/(system-admin)/dashboard",
  hotel_manager: "/(admin)/dashboard",
  staff: "/(staff)/queue",
  guest: "/(guest)/chat",
};

/** Normalize legacy backend role values for routing. */
export function normalizeRole(role: string | undefined | null): Role | null {
  if (!role) return null;
  if (role === "admin") return "hotel_manager";
  if (role === "system_admin" || role === "hotel_manager" || role === "staff" || role === "guest") {
    return role;
  }
  return null;
}

/** Post-login dashboard route for each SaaS role. */
export function dashboardRouteForRole(role: string | undefined | null): Href {
  const normalized = normalizeRole(role);
  if (!normalized) return "/login";
  return DASHBOARD_BY_ROLE[normalized];
}

export const ROLE_LABELS: Record<Role, string> = {
  system_admin: "Sistem Yöneticisi",
  hotel_manager: "Hotel Manager",
  staff: "Personel",
  guest: "Misafir",
};
