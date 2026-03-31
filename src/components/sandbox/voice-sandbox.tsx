"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConversation } from "@11labs/react"
import { api } from "../../../convex/_generated/api"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from "lucide-react"
import {
  createClientTools,
  streamTranscriptSegment,
  notifyCallEnded,
  type ToolContext,
} from "@/lib/elevenlabs-tools"

type CallState = "idle" | "connecting" | "connected"

function ActiveCallUI({
  memberName,
  status,
  isSpeaking,
  onDisconnect,
  onToggleMic,
  micEnabled,
}: {
  memberName: string
  status: string
  isSpeaking: boolean
  onDisconnect: () => void
  onToggleMic: () => void
  micEnabled: boolean
}) {
  const agentStateLabel = isSpeaking
    ? "Speaking"
    : status === "connected"
      ? "Listening"
      : status === "connecting"
        ? "Connecting"
        : "Idle"

  const agentStateDotColor = isSpeaking
    ? "bg-blue-500"
    : status === "connected"
      ? "bg-green-500"
      : "bg-gray-400"

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Member info banner */}
      <div className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm">
        Calling as <span className="font-semibold">{memberName}</span>
      </div>

      {/* Agent state indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={cn(
            "inline-block size-2.5 rounded-full transition-colors",
            agentStateDotColor,
          )}
        />
        {agentStateLabel}
      </div>

      {/* Audio visualizer — simple pulsing ring for ElevenLabs */}
      <div className="flex h-32 w-full max-w-sm items-center justify-center">
        <div
          className={cn(
            "rounded-full border-4 transition-all duration-300",
            isSpeaking
              ? "size-24 border-blue-500 shadow-lg shadow-blue-500/20"
              : status === "connected"
                ? "size-20 border-green-500/50"
                : "size-16 border-gray-300",
          )}
        >
          <div
            className={cn(
              "size-full rounded-full transition-all duration-500",
              isSpeaking
                ? "scale-90 bg-blue-500/20 animate-pulse"
                : status === "connected"
                  ? "scale-75 bg-green-500/10"
                  : "scale-50 bg-gray-200",
            )}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleMic}
          className={cn(!micEnabled && "text-red-500")}
        >
          {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </Button>

        <Button variant="destructive" onClick={onDisconnect} className="gap-2">
          <PhoneOff className="size-4" />
          End Call
        </Button>
      </div>
    </div>
  )
}

export function VoiceSandbox() {
  const members = useAuthQuery(api.members.queries.list, { limit: 100 })
  const membersWithPhone = members?.filter((m: any) => m.phone)

  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [callState, setCallState] = useState<CallState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [activeMemberName, setActiveMemberName] = useState("")
  const [micEnabled, setMicEnabled] = useState(true)

  // Track call metadata for tool handlers
  const toolCtxRef = useRef<ToolContext>({
    callId: null,
    memberId: null,
    membershipPitchEnabled: true,
    membershipPitchPrompt: "",
  })
  const transcriptRef = useRef<Array<{ speaker: string; text: string; timestamp: number }>>([])
  const callStartTimeRef = useRef<number>(0)

  const handleDisconnect = useCallback(() => {
    setCallState("idle")
    setMicEnabled(true)
  }, [])

  // ElevenLabs conversation hook
  const conversation = useConversation({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      console.log("[elevenlabs] Connected:", conversationId)
      setCallState("connected")
    },
    onDisconnect: () => {
      console.log("[elevenlabs] Disconnected — sending call-ended to Convex")
      const callId = toolCtxRef.current.callId
      if (callId) {
        const duration = Math.round((Date.now() - callStartTimeRef.current) / 1000)
        console.log("[elevenlabs] Ending call:", callId, "duration:", duration, "segments:", transcriptRef.current.length)
        notifyCallEnded(callId, duration, transcriptRef.current).catch((e) =>
          console.error("[elevenlabs] Failed to notify call ended:", e)
        )
      } else {
        console.warn("[elevenlabs] No callId — call was never registered in Convex")
      }
      handleDisconnect()
    },
    onMessage: (message) => {
      // Stream transcript segments to Convex in real-time
      const callId = toolCtxRef.current.callId
      if (!callId) return

      const text = message.message
      if (!text) return

      // role: "user" | "agent"
      const role = message.role
      if (role === "agent") {
        transcriptRef.current.push({ speaker: "agent", text, timestamp: Date.now() / 1000 })
        streamTranscriptSegment(callId, "agent", text).catch(console.error)
      } else if (role === "user") {
        transcriptRef.current.push({ speaker: "caller", text, timestamp: Date.now() / 1000 })
        streamTranscriptSegment(callId, "caller", text).catch(console.error)
      }
    },
    onError: (error: string | Error) => {
      console.error("[elevenlabs] Error:", error)
      setError(typeof error === "string" ? error : "Connection error")
    },
    clientTools: createClientTools(toolCtxRef.current),
  })

  // Wire up the end_call tool to disconnect
  useEffect(() => {
    toolCtxRef.current.onCallEnd = () => {
      setTimeout(() => {
        conversation.endSession().catch(console.error)
      }, 3000)
    }
  }, [conversation])

  // Safety net: if user closes tab or navigates away, end the call
  useEffect(() => {
    const handleBeforeUnload = () => {
      const callId = toolCtxRef.current.callId
      if (callId && callState === "connected") {
        const duration = Math.round((Date.now() - callStartTimeRef.current) / 1000)
        navigator.sendBeacon(
          "/api/elevenlabs-transcript",
          JSON.stringify({
            action: "call-ended",
            callId,
            duration,
            transcript: transcriptRef.current,
            status: "completed",
          }),
        )
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [callState])

  async function handleStartCall() {
    const member = membersWithPhone?.find((m: any) => m._id === selectedMemberId)
    if (!member) return

    setCallState("connecting")
    setError(null)
    transcriptRef.current = []
    callStartTimeRef.current = Date.now()

    try {
      const memberName = `${(member as any).firstName} ${(member as any).lastName || ""}`.trim()
      setActiveMemberName(memberName)

      // 1. Get signed URL + register call in Convex (all server-side)
      const res = await fetch("/api/elevenlabs-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberPhone: (member as any).phone,
          memberName,
          memberId: (member as any)._id,
          sandbox: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to get session (${res.status})`)
      }

      const { signedUrl, callId, memberId: resolvedMemberId, settings } = await res.json()

      // 2. Set tool context with call metadata
      toolCtxRef.current.callId = callId
      toolCtxRef.current.memberId = resolvedMemberId || (member as any)._id
      toolCtxRef.current.membershipPitchEnabled = settings?.membershipPitchEnabled ?? true
      toolCtxRef.current.membershipPitchPrompt = settings?.membershipPitchPrompt || ""
      console.log("[sandbox] Session ready — callId:", callId, "memberId:", resolvedMemberId)

      // 3. Start the ElevenLabs conversation
      const overrides: Record<string, unknown> = {}
      if (settings?.voiceAgentPrompt) {
        overrides.agent = { prompt: { prompt: settings.voiceAgentPrompt } }
      }

      await conversation.startSession({
        signedUrl,
        overrides,
      })
    } catch (err: any) {
      setError(err.message || "Failed to start call")
      setCallState("idle")
    }
  }

  async function handleEndCall() {
    try {
      await conversation.endSession()
    } catch {
      // Force disconnect
      handleDisconnect()
    }
  }

  function handleToggleMic() {
    if (micEnabled) {
      conversation.setVolume({ volume: 0 })
    } else {
      conversation.setVolume({ volume: 1 })
    }
    setMicEnabled(!micEnabled)
  }

  // Idle state
  if (callState === "idle") {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Select Member
          </label>
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Select a member...</option>
            {membersWithPhone?.map((m: any) => (
              <option key={m._id} value={m._id}>
                {m.firstName} {m.lastName || ""} ({m.phone})
              </option>
            ))}
          </select>
          {members && membersWithPhone?.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No members with a phone number found.
            </p>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <Button
          onClick={handleStartCall}
          disabled={!selectedMemberId}
          className="gap-2"
        >
          <Phone className="size-4" />
          Start Voice Call
        </Button>
      </div>
    )
  }

  // Connecting state
  if (callState === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Connecting to ElevenLabs...</p>
      </div>
    )
  }

  // Connected state
  return (
    <ActiveCallUI
      memberName={activeMemberName}
      status={conversation.status}
      isSpeaking={conversation.isSpeaking}
      onDisconnect={handleEndCall}
      onToggleMic={handleToggleMic}
      micEnabled={micEnabled}
    />
  )
}
