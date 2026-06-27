import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, User } from "./api";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (b: { email: string; password: string; name: string; role: "guest" | "staff" | "admin"; department?: string; room_no?: string }) => Promise<User>;
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
      setUser(u);
    } catch {
      await setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    await setToken(token);
    setUser(user);
    return user;
  };

  const signUp: AuthCtx["signUp"] = async (b) => {
    const { token, user } = await api.register(b);
    await setToken(token);
    setUser(user);
    return user;
  };

  const signOut = async () => { await setToken(null); setUser(null); };

  return <Ctx.Provider value={{ user, loading, signIn, signUp, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
