import { create } from "zustand";
import type { Organisation, User } from "@/types";
import { apiClient, type SessionResult } from "@/lib/api/client";

// Storage key for the cached profile. Deliberately not tied to the brand name:
// renaming it would sign every user out.
const SESSION_KEY = "pimabill_user";
/** Key used before the rename; read once so nobody is signed out by it. */
const LEGACY_SESSION_KEY = "novabilling_user";

interface AuthState {
  user: User | null;
  organisations: Organisation[];
  isAuthenticated: boolean;
  /** Signs in, or returns the token for the second step when the account uses two-step sign-in. */
  login: (email: string, password: string) => Promise<{ mfaToken: string } | void>;
  completeMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  /** Apply a session returned by sign-in, registration, switching or accepting an invitation. */
  applySession: (session: SessionResult) => void;
  switchOrganisation: (tenantId: string) => Promise<void>;
  createOrganisation: (name: string) => Promise<SessionResult>;
  checkSession: () => Promise<void>;
}

function loadAuthState(): { user: User | null; isAuthenticated: boolean } {
  if (typeof window === "undefined")
    return { user: null, isAuthenticated: false };
  const stored = localStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_SESSION_KEY);
  if (stored) {
    try {
      return { user: JSON.parse(stored), isAuthenticated: true };
    } catch {
      // fall through
    }
  }
  return { user: null, isAuthenticated: false };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadAuthState(),
  organisations: [],

  applySession: (session) => {
    // Only store display info — no tokens or API keys
    localStorage.setItem(SESSION_KEY, JSON.stringify(session.user));
    localStorage.removeItem(LEGACY_SESSION_KEY);
    set((s) => ({ user: session.user, isAuthenticated: true, organisations: session.organisations ?? s.organisations }));
  },

  login: async (email: string, password: string) => {
    const result = await apiClient.auth.login(email, password);
    if ("mfaRequired" in result) return { mfaToken: result.mfaToken };
    get().applySession(result);
    await get().checkSession();
  },

  completeMfa: async (mfaToken: string, code: string) => {
    get().applySession(await apiClient.auth.verifyMfa(mfaToken, code));
    await get().checkSession();
  },

  logout: () => {
    apiClient.auth.logout().catch(() => {});
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    set({ user: null, isAuthenticated: false, organisations: [] });
  },

  setUser: (user: User) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    set({ user });
  },

  switchOrganisation: async (tenantId: string) => {
    get().applySession(await apiClient.auth.switchOrganisation(tenantId));
  },

  createOrganisation: async (name: string) => {
    const session = await apiClient.auth.createOrganisation(name);
    get().applySession(session);
    await get().checkSession();
    return session;
  },

  checkSession: async () => {
    const result = await apiClient.auth.me();
    if (result) {
      get().applySession(result);
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
      set({ user: null, isAuthenticated: false, organisations: [] });
    }
  },
}));
