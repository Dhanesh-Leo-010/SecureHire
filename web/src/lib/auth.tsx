import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { stopRealtime } from './realtime';

type User = { id: number; email: string; name: string; role: 'candidate' | 'recruiter' | 'admin'; emailVerified: boolean };
type Ctx = { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<User>; logout: () => Promise<void>; refresh: () => Promise<void>; setUser: (u: User | null) => void };

const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try { const r = await api.get('/api/auth/me'); setUser(r.user); } catch { setUser(null); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  const login = async (email: string, password: string) => { const r = await api.post('/api/auth/login', { email, password }); setUser(r.user); return r.user; };
  const logout = async () => { await api.post('/api/auth/logout'); stopRealtime(); setUser(null); };
  return <AuthCtx.Provider value={{ user, loading, login, logout, refresh, setUser }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
export const homeFor = (role?: string) => (role === 'admin' ? '/admin' : role === 'recruiter' ? '/recruiter' : '/candidate');
