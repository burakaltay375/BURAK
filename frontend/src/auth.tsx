import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, User } from "./api";
import { normalizeRole } from "./roles";

function withNormalizedRole(user: User): User {
  const role = normalizeRole(user.role);
  return role ? { ...user, role } : user;
}

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, selectedHotelId?: string | null) => Promise<User>;
  signUp: (b: { email: string; password: string; name: string; role: "guest"; room_no?: string }) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) { setUser(null); setLoading(false); return; }
    try {
      const u = await api.me();
      setUser(withNormalizedRole(u));
    } catch {
      await setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = async (email: string, password: string, selectedHotelId?: string | null) => {
    const { token, user } = await api.login(email, password, selectedHotelId);
    await setToken(token);
    const normalized = withNormalizedRole(user);
    const withHotelContext = normalized.role === "system_admin" && selectedHotelId
      ? { ...normalized, hotel_id: selectedHotelId, hotelId: selectedHotelId }
      : normalized;
    setUser(withHotelContext);
    return withHotelContext;
  };

  const signUp: AuthCtx["signUp"] = async (b) => {
    const { token, user } = await api.register(b);
    await setToken(token);
    const normalized = withNormalizedRole(user);
    setUser(normalized);
    return normalized;
  };

  const signOut = async () => { await setToken(null); setUser(null); };

  return <Ctx.Provider value={{ user, loading, signIn, signUp, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
