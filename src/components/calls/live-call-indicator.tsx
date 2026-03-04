"use client"

import { useEffect, useState } from "react"
import { Phone } from "lucide-react"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"

function formatElapsed(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function LiveCallIndicator() {
  const activeCalls = useAuthQuery(api.voice.queries.getActiveCalls, {})
  const [, setTick] = useState(0)

  // Update elapsed time every second
  useEffect(() => {
    if (!activeCalls || activeCalls.length === 0) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [activeCalls])

  if (!activeCalls || activeCalls.length === 0) return null

  return (
    <div className="mx-4 rounded-lg border border-green-500/20 bg-green-500/5 p-3 lg:mx-6">
      <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-green-500" />
        </span>
        {activeCalls.length === 1 ? "1 Active Call" : `${activeCalls.length} Active Calls`}
      </div>
      <div className="mt-2 space-y-1">
        {activeCalls.map((call) => (
          <div
            key={call._id}
            className="flex items-center justify-between text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <Phone className="size-3" />
              <span>{call.memberName ?? call.phone ?? "Unknown"}</span>
              <span className="text-xs opacity-60">
                {call.direction === "outbound" ? "Outbound" : "Inbound"}
              </span>
            </div>
            <span className="tabular-nums">{formatElapsed(call.startedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
