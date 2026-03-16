"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Session data structure stored in the auth cookie
 */
export interface SessionData {
  email: string;
  name: string;
  role: "developer" | "super_admin" | "admin";
  adminId: string;
  sessionToken: string;
  timestamp: number;
}

/**
 * Auth context value provided to components
 */
interface AuthContextValue {
  session: SessionData | null;
  sessionToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => void;
  refreshSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Parse session from cookie
 */
function getSessionFromCookie(): SessionData | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  const authCookie = cookies.find((c) => c.trim().startsWith("auth-token="));

  if (!authCookie) return null;

  try {
    const value = authCookie.split("=")[1];
    const decoded = JSON.parse(atob(decodeURIComponent(value.trim())));

    // Validate required fields
    if (
      decoded.email &&
      decoded.adminId &&
      decoded.sessionToken &&
      decoded.timestamp
    ) {
      // Check if session is not older than 30 days
      if (Date.now() - decoded.timestamp < 30 * 24 * 60 * 60 * 1000) {
        return decoded as SessionData;
      }
    }
  } catch {
    // Invalid cookie
  }

  return null;
}

/**
 * Clear auth cookie
 */
function clearAuthCookie() {
  if (typeof document !== "undefined") {
    document.cookie = "auth-token=; path=/; max-age=0";
  }
}

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Read cookie on client-side mount
  useEffect(() => {
    const cookieSession = getSessionFromCookie();
    setSession(cookieSession);
    setHasMounted(true);
    if (!cookieSession) {
      setIsLoading(false);
    }
  }, []);

  const sessionToken = session?.sessionToken ?? null;

  // Verify session token against backend
  const verificationResult = useQuery(
    api.auth.auth.verifySession,
    hasMounted && sessionToken ? { sessionToken } : "skip"
  );

  // Handle verification result
  useEffect(() => {
    if (!hasMounted) return;

    if (!session) {
      setIsLoading(false);
      return;
    }

    if (verificationResult === undefined) {
      return;
    }

    if (verificationResult.valid) {
      setIsLoading(false);
    } else {
      clearAuthCookie();
      setSession(null);
      setIsLoading(false);
      if (pathname && !pathname.startsWith("/login")) {
        router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
      }
    }
  }, [hasMounted, session, verificationResult, pathname, router]);

  const refreshSession = useCallback(() => {
    const sessionData = getSessionFromCookie();
    setSession(sessionData);
    if (!sessionData) {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthCookie();
    setSession(null);
    router.push("/login");
  }, [router]);

  // Listen for auth errors
  useEffect(() => {
    const handleAuthError = () => {
      logout();
    };

    window.addEventListener("auth-error" as any, handleAuthError);
    return () => {
      window.removeEventListener("auth-error" as any, handleAuthError);
    };
  }, [logout]);

  const isVerified = !isLoading && verificationResult?.valid === true;

  const value: AuthContextValue = {
    session: isVerified ? session : null,
    sessionToken: isVerified ? session?.sessionToken ?? null : null,
    isLoading,
    isAuthenticated: isVerified && !!session,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useSessionToken(): string | null {
  const { sessionToken } = useAuth();
  return sessionToken;
}

export function useRequireAuth(): SessionData | null {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !session) {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [session, isLoading, router, pathname]);

  return session;
}

export function dispatchAuthError() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth-error"));
  }
}
