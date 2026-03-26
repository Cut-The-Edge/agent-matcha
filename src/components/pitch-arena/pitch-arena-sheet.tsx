"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Loader2,
  Sparkles,
  Copy,
  Check,
  User,
} from "lucide-react"
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react"

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface PitchArenaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: Id<"members">
  matchMemberId: Id<"members">
  matchId?: Id<"matches">
  actionItemId?: Id<"actionQueue">
  memberName: string
  matchName: string
  matchPhone: string
}

type CallState = "idle" | "connecting" | "active" | "ended"

// ═══════════════════════════════════════════════════════════════════════════
// Active Call Controls (inside LiveKitRoom context)
// ═══════════════════════════════════════════════════════════════════════════

function CallControls({ onEndCall }: { onEndCall: () => void }) {
  const room = useRoomContext()
  const [micEnabled, setMicEnabled] = useState(true)

  // Auto-detect when SIP participant disconnects
  useEffect(() => {
    const handler = () => {
      if (room.remoteParticipants.size === 0) {
        onEndCall()
      }
    }
    room.on("participantDisconnected", handler)
    return () => { room.off("participantDisconnected", handler) }
  }, [room, onEndCall])

  async function toggleMic() {
    await room.localParticipant.setMicrophoneEnabled(!micEnabled)
    setMicEnabled(!micEnabled)
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={toggleMic}>
        {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4 text-red-500" />}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          room.disconnect()
          onEndCall()
        }}
        className="gap-1.5"
      >
        <PhoneOff className="size-3.5" />
        End Call
      </Button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Pitch Display
// ═══════════════════════════════════════════════════════════════════════════

function PitchCard({ pitch, index }: { pitch: { pitch: string; generatedAt: number }; index: number }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(pitch.pitch)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Pitch #{index + 1}
        </span>
        <Button variant="ghost" size="icon" className="size-6" onClick={handleCopy}>
          {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{pitch.pitch}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export function PitchArenaSheet({
  open,
  onOpenChange,
  memberId,
  matchMemberId,
  matchId,
  actionItemId,
  memberName,
  matchName,
  matchPhone,
}: PitchArenaProps) {
  const [callState, setCallState] = useState<CallState>("idle")
  const [token, setToken] = useState("")
  const [roomName, setRoomName] = useState("")
  const [sessionId, setSessionId] = useState<Id<"pitchArenaSessions"> | null>(null)
  const [callId, setCallId] = useState<Id<"phoneCalls"> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const { mutateWithAuth: createSession } = useAuthMutation(api.pitchArena.mutations.createSession)
  const { mutateWithAuth: endSessionMut } = useAuthMutation(api.pitchArena.mutations.endSession)
  const { mutateWithAuth: cancelSessionMut } = useAuthMutation(api.pitchArena.mutations.cancelSession)

  // Live transcript (reactive — updates in real time)
  const transcript = useAuthQuery(
    api.pitchArena.queries.getLiveTranscript,
    callId ? { callId } : "skip"
  )

  // Session data (includes generated pitches)
  const session = useAuthQuery(
    api.pitchArena.queries.getSession,
    sessionId ? { sessionId } : "skip"
  )

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript?.length])

  // Call timer
  useEffect(() => {
    if (callState === "active") {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callState])

  // ─── Start Call ────────────────────────────────────────────────────
  async function handleStartCall() {
    setCallState("connecting")
    setError(null)

    try {
      // 1. Place the SIP call and get a browser token
      const res = await fetch("/api/pitch-arena-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: matchPhone, matchName }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Call failed (${res.status})`)
      }

      const data = await res.json()

      // 2. Create the Convex session + phone call record
      const result = await createSession({
        memberId,
        matchMemberId,
        matchId,
        actionItemId,
        livekitRoomName: data.roomName,
        phone: data.phone,
      })

      setToken(data.token)
      setRoomName(data.roomName)
      setSessionId(result.sessionId)
      setCallId(result.callId)
      setCallDuration(0)
      setCallState("active")
    } catch (err: any) {
      setError(err.message || "Failed to start call")
      setCallState("idle")
    }
  }

  // ─── End Call ──────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setCallState("ended")
    setToken("")

    if (sessionId) {
      await endSessionMut({ sessionId })
    }
  }, [sessionId, endSessionMut])

  // ─── Generate Pitch ────────────────────────────────────────────────
  async function handleGeneratePitch() {
    if (!sessionId) return
    setGenerating(true)
    try {
      await fetch("/api/pitch-arena-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      // Error handling is minimal — the pitch will appear via reactive query
    } finally {
      setGenerating(false)
    }
  }

  // ─── Close sheet ───────────────────────────────────────────────────
  function handleClose() {
    if (callState === "active" && sessionId) {
      cancelSessionMut({ sessionId })
    }
    setCallState("idle")
    setToken("")
    setSessionId(null)
    setCallId(null)
    setError(null)
    setCallDuration(0)
    onOpenChange(false)
  }

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  const pitches = session?.generatedPitches ?? []

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">Pitch Arena</SheetTitle>
            {callState === "active" && (
              <Badge variant="outline" className="tabular-nums font-mono">
                {formatDuration(callDuration)}
              </Badge>
            )}
          </div>
          {/* Member → Match context */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="size-3" />
            <span className="font-medium">{memberName}</span>
            <span>→</span>
            <span className="font-medium">{matchName}</span>
            <span>({matchPhone})</span>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* ── Idle: Context cards + Start call button ── */}
          {callState === "idle" && (
            <div className="flex flex-1 flex-col gap-4 p-4">
              {/* Member context card */}
              <div className="rounded-lg border bg-card p-3">
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Member (who hired us)
                </h4>
                <p className="font-medium">{memberName}</p>
              </div>

              {/* Match context card */}
              <div className="rounded-lg border bg-card p-3">
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Match (person to call)
                </h4>
                <p className="font-medium">{matchName}</p>
                <p className="text-xs text-muted-foreground">{matchPhone}</p>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <Button onClick={handleStartCall} className="gap-2">
                <Phone className="size-4" />
                Call {matchName}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Dials {matchPhone} using Matcha&apos;s number.
                <br />
                You&apos;ll speak directly — no AI agent.
              </p>
            </div>
          )}

          {/* ── Connecting ── */}
          {callState === "connecting" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Dialing {matchName}...
              </p>
            </div>
          )}

          {/* ── Active Call / Ended ── */}
          {(callState === "active" || callState === "ended") && (
            <>
              {/* Call controls */}
              {callState === "active" && token && (
                <div className="border-b px-4 py-2">
                  <LiveKitRoom
                    serverUrl={LIVEKIT_URL}
                    token={token}
                    connect={true}
                    audio={true}
                    video={false}
                    onDisconnected={handleEndCall}
                  >
                    <CallControls onEndCall={handleEndCall} />
                    <RoomAudioRenderer />
                  </LiveKitRoom>
                </div>
              )}

              {callState === "ended" && (
                <div className="border-b bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground">
                  Call ended &middot; {formatDuration(callDuration)}
                </div>
              )}

              {/* Generate Pitch button */}
              <div className="border-b px-4 py-2">
                <Button
                  onClick={handleGeneratePitch}
                  disabled={generating}
                  className="w-full gap-2"
                  variant="secondary"
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {generating ? "Generating..." : "Create Sales Pitch"}
                </Button>
              </div>

              {/* Two-panel scroll area: transcript + pitches */}
              <ScrollArea className="flex-1">
                <div className="space-y-4 p-4">
                  {/* Pitches */}
                  {pitches.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                        Generated Pitches
                      </h4>
                      {pitches.map((p: any, i: number) => (
                        <PitchCard key={i} pitch={p} index={i} />
                      ))}
                    </div>
                  )}

                  {/* Live Transcript */}
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Live Transcript
                    </h4>
                    {(!transcript || transcript.length === 0) ? (
                      <p className="text-xs text-muted-foreground italic">
                        {callState === "active"
                          ? "Waiting for speech..."
                          : "No transcript recorded."}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {transcript.map((seg: any) => (
                          <div key={seg._id} className="text-sm">
                            <Badge
                              variant="outline"
                              className="mr-1.5 text-[10px]"
                            >
                              {seg.speaker === "caller" ? "Match" : "Dani"}
                            </Badge>
                            {seg.text}
                          </div>
                        ))}
                        <div ref={transcriptEndRef} />
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
