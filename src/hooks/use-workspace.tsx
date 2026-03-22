"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"

export type Workspace = "matchmaking" | "interviewer"

interface WorkspaceContext {
  workspace: Workspace
  setWorkspace: (workspace: Workspace) => void
}

const WorkspaceCtx = createContext<WorkspaceContext | null>(null)

const STORAGE_KEY = "matcha-workspace"

/** Pages that are specific to Matchmaking — navigating here while in Interviewer should switch workspace */
const MATCHMAKING_PAGES = [
  "/dashboard/conversations",
  "/dashboard/leads",
  "/dashboard/flows",
  "/dashboard/escalations",
  "/dashboard/recalibration",
  "/dashboard/data-requests",
  "/dashboard/matches",
  "/dashboard/sandbox",
]

/** Pages that are specific to Interviewer */
const INTERVIEWER_PAGES = [
  "/dashboard/calls",
]

/** Default landing page per workspace */
const WORKSPACE_HOME: Record<Workspace, string> = {
  matchmaking: "/dashboard",
  interviewer: "/dashboard",
}

function detectWorkspaceFromPath(pathname: string): Workspace | null {
  if (MATCHMAKING_PAGES.some((p) => pathname.startsWith(p))) return "matchmaking"
  if (INTERVIEWER_PAGES.some((p) => pathname.startsWith(p))) return "interviewer"
  return null
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [workspace, setWorkspaceState] = useState<Workspace>("matchmaking")
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Workspace | null
    if (stored === "matchmaking" || stored === "interviewer") {
      setWorkspaceState(stored)
    }
    setHydrated(true)
  }, [])

  // Sync workspace when user navigates to a workspace-specific page
  useEffect(() => {
    if (!hydrated) return
    const detected = detectWorkspaceFromPath(pathname)
    if (detected && detected !== workspace) {
      setWorkspaceState(detected)
      localStorage.setItem(STORAGE_KEY, detected)
    }
  }, [pathname, hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  const setWorkspace = useCallback(
    (ws: Workspace) => {
      setWorkspaceState(ws)
      localStorage.setItem(STORAGE_KEY, ws)
      // Navigate to workspace home when switching via tabs
      router.push(WORKSPACE_HOME[ws])
    },
    [router],
  )

  return (
    <WorkspaceCtx.Provider value={{ workspace, setWorkspace }}>
      {children}
    </WorkspaceCtx.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx)
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider")
  return ctx
}
