"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import {
  Play,
  Loader2,
  Trash2,
  ArrowRight,
  CheckCircle,
  CircleDot,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toast } from "sonner"

type Outcome = "match_interested" | "match_not_interested" | "match_no_response"

const OUTCOMES: { value: Outcome; label: string; emoji: string }[] = [
  { value: "match_interested", label: "Match is Interested", emoji: "✓" },
  { value: "match_not_interested", label: "Match Declined", emoji: "✗" },
  { value: "match_no_response", label: "No Response Yet", emoji: "?" },
]

export function OutreachSandbox() {
  const router = useRouter()

  // Data
  const members = useAuthQuery(api.members.queries.list, { limit: 100 })
  const actionItems = useAuthQuery(api.actionQueue.queries.list, {})
  const activeInstances = useQuery(api.engine.queries.listFlowInstances, {
    status: "active",
  })

  // Mutations
  const simulateScenario = useMutation(
    api.actionQueue.sandboxMutations.simulateOutreachScenario
  )
  const cleanupSandbox = useMutation(
    api.actionQueue.sandboxMutations.cleanupSandbox
  )
  const { mutateWithAuth: updateStatus } = useAuthMutation(
    api.actionQueue.mutations.updateStatus
  )
  const { mutateWithAuth: recordOutcome } = useAuthMutation(
    api.actionQueue.mutations.updateOutreachOutcome
  )

  // Step tracking
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [memberAId, setMemberAId] = useState("")
  const [memberBId, setMemberBId] = useState("")
  const [createdItemId, setCreatedItemId] = useState<Id<"actionQueue"> | null>(null)
  const [createdMatchId, setCreatedMatchId] = useState<Id<"matches"> | null>(null)
  const [outcome, setOutcome] = useState<Outcome>("match_interested")
  const [notes, setNotes] = useState("")
  const [brief, setBrief] = useState(
    "Key talking points:\n- Both enjoy outdoor activities\n- Similar career stage\n- Shared cultural values"
  )
  const [isCreating, setIsCreating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)

  // Sandbox action items only
  const sandboxItems = (actionItems ?? []).filter(
    (i: any) => i.context?.sandbox
  )

  // Outreach flow instances
  const outreachInstances = (activeInstances ?? []).filter((inst: any) => {
    const ctx = inst.context as any
    return ctx?.outreachOutcome != null
  })

  // ── Step 1: Create scenario ──
  const handleCreateScenario = async () => {
    if (!memberAId || !memberBId) {
      toast.error("Select both members")
      return
    }
    setIsCreating(true)
    try {
      const result = await simulateScenario({
        payingMemberId: memberAId as Id<"members">,
        matchPartnerId: memberBId as Id<"members">,
      })
      console.log("[sandbox] Created scenario:", result)
      setCreatedItemId(result.actionItemId)
      setCreatedMatchId(result.matchId)
      setStep(2)
      toast.success(
        `Created: match + $125 payment + action item for ${result.payingMember} → ${result.matchPartner}`
      )
    } catch (err: any) {
      toast.error(err?.message || "Failed to create scenario")
    } finally {
      setIsCreating(false)
    }
  }

  // ── Step 2: Mark in progress ──
  const handleStartWorking = async () => {
    if (!createdItemId) {
      toast.error("No action item found — try Step 1 again")
      return
    }
    try {
      await updateStatus({
        actionItemId: createdItemId,
        status: "in_progress",
      })
      toast.success("Item marked as in progress — Dani is doing outreach")
      setStep(3)
    } catch (err: any) {
      toast.error(err?.message || "Failed")
    }
  }

  // ── Step 3: Record outcome ──
  const handleRecordOutcome = async () => {
    if (!createdItemId) {
      toast.error("No action item found — did Step 1 complete? Try starting over.")
      return
    }
    setIsRecording(true)
    try {
      await recordOutcome({
        actionItemId: createdItemId,
        outreachOutcome: outcome,
        outreachNotes: notes || "Sandbox test",
        matchIntelligenceBrief:
          outcome === "match_interested" ? brief : undefined,
      })
      toast.success(
        `Outcome recorded! Continuation flow triggered → check WhatsApp or the flow monitor`
      )
    } catch (err: any) {
      toast.error(err?.message || "Failed to record outcome")
    } finally {
      setIsRecording(false)
    }
  }

  // ── Cleanup ──
  const handleCleanup = async () => {
    if (
      !confirm(
        "Delete all sandbox matches, payments, action items, and flow instances?"
      )
    )
      return
    setIsCleaning(true)
    try {
      const result = await cleanupSandbox({})
      setStep(1)
      setCreatedItemId(null)
      setCreatedMatchId(null)
      setMemberAId("")
      setMemberBId("")
      toast.success(`Cleaned up ${result.deleted} sandbox records`)
    } catch (err: any) {
      toast.error(err?.message || "Cleanup failed")
    } finally {
      setIsCleaning(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">How to test the Outreach Flow</h3>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>
            <strong>Step 1:</strong> Pick 2 test members → click "Create Test
            Scenario" → creates a match, fake $125 payment, and action queue item
          </li>
          <li>
            <strong>Step 2:</strong> Click "Start Working" → simulates Dani
            beginning outreach to the match partner
          </li>
          <li>
            <strong>Step 3:</strong> Pick an outcome + add notes → click "Record
            Outcome" → triggers the WhatsApp continuation flow to the paying
            member's real phone
          </li>
        </ol>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          WhatsApp messages go to real phones. Use test members with your own number.
        </p>
      </div>

      {/* ═══════════ STEP 1 ═══════════ */}
      <div
        className={`rounded-lg border p-4 transition-opacity ${
          step >= 1 ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          {step > 1 ? (
            <CheckCircle className="size-5 text-green-600" />
          ) : (
            <CircleDot className="size-5 text-primary" />
          )}
          <h4 className="text-sm font-semibold">
            Step 1: Create Test Scenario
          </h4>
          {step > 1 && (
            <Badge variant="secondary" className="text-[10px]">
              Done
            </Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Paying Member (receives WhatsApp)
            </label>
            <select
              value={memberAId}
              onChange={(e) => setMemberAId(e.target.value)}
              disabled={step > 1}
              className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">Select member...</option>
              {members?.map((m: any) => (
                <option key={m._id} value={m._id}>
                  {m.firstName} {m.lastName || ""}{" "}
                  {m.phone ? `(${m.phone})` : "(no phone)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Match Partner (Dani contacts this person)
            </label>
            <select
              value={memberBId}
              onChange={(e) => setMemberBId(e.target.value)}
              disabled={step > 1}
              className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">Select partner...</option>
              {members
                ?.filter((m: any) => m._id !== memberAId)
                .map((m: any) => (
                  <option key={m._id} value={m._id}>
                    {m.firstName} {m.lastName || ""}{" "}
                    {m.phone ? `(${m.phone})` : "(no phone)"}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {step === 1 && (
          <Button
            onClick={handleCreateScenario}
            disabled={isCreating || !memberAId || !memberBId}
            className="mt-3 gap-2"
          >
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Create Test Scenario (match + payment + action item)
          </Button>
        )}
      </div>

      {/* ═══════════ STEP 2 ═══════════ */}
      <div
        className={`rounded-lg border p-4 transition-opacity ${
          step >= 2 ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          {step > 2 ? (
            <CheckCircle className="size-5 text-green-600" />
          ) : step === 2 ? (
            <CircleDot className="size-5 text-primary" />
          ) : (
            <CircleDot className="size-5 text-muted-foreground" />
          )}
          <h4 className="text-sm font-semibold">
            Step 2: Start Working (Dani begins outreach)
          </h4>
          {step > 2 && (
            <Badge variant="secondary" className="text-[10px]">
              Done
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          This simulates Dani seeing the action item in her queue and starting to
          contact the match partner by phone/text.
        </p>

        {step === 2 && (
          <Button onClick={handleStartWorking} variant="outline" className="gap-2">
            <Play className="size-4" />
            Start Working
          </Button>
        )}
      </div>

      {/* ═══════════ STEP 3 ═══════════ */}
      <div
        className={`rounded-lg border p-4 transition-opacity ${
          step >= 3 ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <CircleDot
            className={`size-5 ${
              step === 3 ? "text-primary" : "text-muted-foreground"
            }`}
          />
          <h4 className="text-sm font-semibold">
            Step 3: Record Outcome (what did the match partner say?)
          </h4>
        </div>

        {step === 3 && (
          <>
            {/* Outcome picker */}
            <div className="space-y-2 mb-4">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setOutcome(o.value)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    outcome === o.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm font-medium">
                    {o.emoji} {o.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Notes */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Outreach Notes
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  outcome === "match_not_interested"
                    ? "e.g. She said she's currently seeing someone (AI will try to generate a soft insight)"
                    : "e.g. Spoke with Sarah, she's excited about the intro"
                }
                className="min-h-[60px]"
              />
            </div>

            {/* Brief for interested */}
            {outcome === "match_interested" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Match Intelligence Brief (sent to paying member)
                </label>
                <Textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            )}

            <Button
              onClick={handleRecordOutcome}
              disabled={isRecording}
              className="gap-2"
            >
              {isRecording ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageSquare className="size-4" />
              )}
              Record Outcome → Send WhatsApp
            </Button>

            {/* What happens next */}
            <div className="mt-3 rounded-md bg-muted/50 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                What happens next:
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {outcome === "match_interested" &&
                  "WhatsApp sent to paying member with the brief + 'Yes – Connect Us' / 'No – I'll Pass' buttons. If they say Yes → $125 payment link → contact info shared."}
                {outcome === "match_not_interested" &&
                  "AI generates a soft insight from your notes (if shareable). WhatsApp sent: 'they decided not to move forward' + optional insight. Match → Past Introductions."}
                {outcome === "match_no_response" &&
                  "WhatsApp sent: 'we tried reaching them' + 'Keep trying' / 'Find the next match' buttons. Follow-up reminder set for 5 days."}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Active flow instances */}
      {outreachInstances.length > 0 && (
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 text-sm font-semibold">
            Active Outreach Flows
          </h4>
          <div className="space-y-2">
            {outreachInstances.map((inst: any) => {
              const ctx = inst.context as any
              const member = members?.find(
                (m: any) => m._id === inst.memberId
              )
              return (
                <div
                  key={inst._id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">
                        {member?.firstName || "?"}{" "}
                        {member?.lastName || ""}
                      </span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {ctx?.metadata?.matchFirstName || "?"}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {ctx?.outreachOutcome?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Node: {inst.currentNodeId} · {inst.status}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      router.push(
                        `/dashboard/flows/monitor/${inst._id}`
                      )
                    }
                  >
                    Monitor
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cleanup */}
      <div className="flex items-center gap-3 pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCleanup}
          disabled={isCleaning}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          {isCleaning ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Trash2 className="size-3" />
          )}
          Clean Up Sandbox Data
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Removes all sandbox matches, payments, action items & flows
        </span>
      </div>
    </div>
  )
}
