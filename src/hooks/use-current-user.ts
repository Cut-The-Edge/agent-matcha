"use client"

import { useState, useEffect } from "react"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../convex/_generated/api"

export interface CurrentUser {
  email: string
  name: string
  role: "developer" | "super_admin" | "admin"
  adminId: string
}

// Default user shown during SSR and initial hydration
const DEFAULT_USER: CurrentUser = {
  email: "",
  name: "Loading...",
  role: "admin",
  adminId: "",
}

export function useCurrentUser(): CurrentUser {
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  // Fetch live user data from Convex (always fresh, reactive)
  const me = useAuthQuery(api.auth.admins.me, {})

  // During SSR, return default to ensure hydration match
  if (!hasMounted) {
    return DEFAULT_USER
  }

  // Once mounted, prefer Convex data (live from DB)
  if (me) {
    return {
      email: me.email || "",
      name: me.name || "User",
      role: me.role || "admin",
      adminId: me._id || "",
    }
  }

  // Fallback to cookie while Convex query is loading
  return getCookieUser()
}

function getCookieUser(): CurrentUser {
  if (typeof document === "undefined") return DEFAULT_USER

  const cookies = document.cookie.split(";")
  const authCookie = cookies.find((c) => c.trim().startsWith("auth-token="))

  if (!authCookie) return DEFAULT_USER

  try {
    const token = authCookie.split("=")[1]
    const decoded = JSON.parse(atob(decodeURIComponent(token)))
    return {
      email: decoded.email || "",
      name: decoded.name || "User",
      role: decoded.role || "admin",
      adminId: decoded.adminId || "",
    }
  } catch {
    return DEFAULT_USER
  }
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
