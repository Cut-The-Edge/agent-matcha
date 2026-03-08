"use client"

import { useEffect, useState } from "react"
import { api } from "../../../convex/_generated/api"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from "lucide-react"
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react"

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL

type CallState = "idle" | "connecting" | "connected"

function ActiveCallUI({
  memberName,
  onDisconnect,
}: {
  memberName: string
  onDisconnect: () => void
}) {
  const { state, audioTrack } = useVoiceAssistant()
  const room = useRoomContext()
  const [micEnabled, setMicEnabled] = useState(true)

  // Auto-disconnect when the agent leaves the room (e.g. agent calls end_call)
  useEffect(() => {
    const handler = () => {
      // If no remote participants remain, the agent has left
      if (room.remoteParticipants.size === 0) {
        room.disconnect()
        onDisconnect()
      }
    }
    room.on("participantDisconnected", handler)
    return () => { room.off("participantDisconnected", handler) }
  }, [room, onDisconnect])

  const agentStateLabel =
    state === "listening"
      ? "Listening"
      : state === "thinking"
        ? "Thinking"
        : state === "speaking"
          ? "Speaking"
          : "Connecting"

  const agentStateDotColor =
    state === "listening"
      ? "bg-green-500"
      : state === "thinking"
        ? "bg-yellow-500"
        : state === "speaking"
          ? "bg-blue-500"
          : "bg-gray-400"

  async function toggleMic() {
    await room.localParticipant.setMicrophoneEnabled(!micEnabled)
    setMicEnabled(!micEnabled)
  }

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
            "inline-block size-2.5 rounded-full",
            agentStateDotColor
          )}
        />
        {agentStateLabel}
      </div>

      {/* Audio visualizer */}
      <div className="h-32 w-full max-w-sm">
        <BarVisualizer
          state={state}
          trackRef={audioTrack}
          barCount={7}
          className="h-full w-full"
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleMic}
          className={cn(!micEnabled && "text-red-500")}
        >
          {micEnabled ? (
            <Mic className="size-4" />
          ) : (
            <MicOff className="size-4" />
          )}
        </Button>

        <Button
          variant="destructive"
          onClick={() => {
            room.disconnect()
            onDisconnect()
          }}
          className="gap-2"
        >
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
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [activeMemberName, setActiveMemberName] = useState("")

  async function handleStartCall() {
    const member = membersWithPhone?.find(
      (m: any) => m._id === selectedMemberId
    )
    if (!member) return

    setCallState("connecting")
    setError(null)

    try {
      const roomName = `sandbox-voice-${Date.now()}`
      const res = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberPhone: (member as any).phone,
          memberName: `${(member as any).firstName} ${(member as any).lastName || ""}`.trim(),
          roomName,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to get token (${res.status})`)
      }

      const data = await res.json()
      setActiveMemberName(
        `${(member as any).firstName} ${(member as any).lastName || ""}`.trim()
      )
      setToken(data.token)
      setCallState("connected")
    } catch (err: any) {
      setError(err.message || "Failed to start call")
      setCallState("idle")
    }
  }

  function handleDisconnect() {
    setToken("")
    setCallState("idle")
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
        <p className="text-sm text-muted-foreground">Connecting...</p>
      </div>
    )
  }

  // Connected state
  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={handleDisconnect}
    >
      <ActiveCallUI
        memberName={activeMemberName}
        onDisconnect={handleDisconnect}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}
