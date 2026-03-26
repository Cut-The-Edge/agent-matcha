"use client"

import { useState, useEffect } from "react"
import { Loader2, Sparkles, CalendarIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toast } from "sonner"

type Outcome = "match_interested" | "match_not_interested" | "match_no_response"

const OUTCOME_OPTIONS: { value: Outcome; label: string; description: string }[] = [
  {
    value: "match_interested",
    label: "Match is Interested",
    description: "The match partner is open to the introduction",
  },
  {
    value: "match_not_interested",
    label: "Match is Not Interested",
    description: "The match partner declined the introduction",
  },
  {
    value: "match_no_response",
    label: "Match Hasn't Responded",
    description: "Haven't been able to reach the match partner yet",
  },
]

export function RecordOutcomeDialog({
  actionItemId,
  onClose,
}: {
  actionItemId: Id<"actionQueue"> | null
  onClose: () => void
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [notes, setNotes] = useState("")
  const [brief, setBrief] = useState("")
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined)
  const [isPending, setIsPending] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // Reactive query for the action item — picks up AI-generated brief in real time
  const itemDetail = useAuthQuery(
    api.actionQueue.queries.getById,
    actionItemId ? { actionItemId } : "skip"
  )

  const { mutateWithAuth: updateOutcome } = useAuthMutation(
    api.actionQueue.mutations.updateOutreachOutcome
  )
  const { mutateWithAuth: requestBrief } = useAuthMutation(
    api.actionQueue.mutations.requestIntelligenceBrief
  )

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!actionItemId) {
      setOutcome(null)
      setNotes("")
      setBrief("")
      setFollowUpDate(undefined)
    }
  }, [actionItemId])

  // Sync AI-generated brief from DB into local state
  useEffect(() => {
    if (itemDetail?.matchIntelligenceBrief && !brief) {
      setBrief(itemDetail.matchIntelligenceBrief)
    }
  }, [itemDetail?.matchIntelligenceBrief])

  const handleGenerateBrief = async () => {
    if (!actionItemId) return
    setIsGenerating(true)
    try {
      await requestBrief({ actionItemId })
      toast.success("Brief generation started — it will appear shortly")
      // The brief is saved to the DB; real-time query will pick it up.
      // For now, show a message to the user.
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate brief")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = async () => {
    if (!actionItemId || !outcome) return
    setIsPending(true)
    try {
      await updateOutcome({
        actionItemId,
        outreachOutcome: outcome,
        outreachNotes: notes || undefined,
        matchIntelligenceBrief:
          outcome === "match_interested" && brief ? brief : undefined,
        followUpDate:
          outcome === "match_no_response" && followUpDate
            ? followUpDate.getTime()
            : undefined,
      })
      toast.success("Outcome recorded")
      onClose()
    } catch (error: any) {
      toast.error(error?.message || "Failed to record outcome")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={!!actionItemId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Outreach Outcome</DialogTitle>
          <DialogDescription>
            What happened when you contacted the match partner?
          </DialogDescription>
        </DialogHeader>

        {/* Outcome selection */}
        <div className="space-y-2">
          {OUTCOME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setOutcome(option.value)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                outcome === option.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-muted/50"
              }`}
              disabled={isPending}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground">
                {option.description}
              </div>
            </button>
          ))}
        </div>

        {/* Match Interested: Intelligence Brief */}
        {outcome === "match_interested" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Match Intelligence Brief
              </label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={handleGenerateBrief}
                disabled={isGenerating || isPending}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Generate with AI
                  </>
                )}
              </Button>
            </div>
            <Textarea
              placeholder="Summary of what you learned from talking to the match partner..."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="min-h-[120px]"
              disabled={isPending}
            />
          </div>
        )}

        {/* No Response: Follow-up date */}
        {outcome === "match_no_response" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Follow-up Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  disabled={isPending}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {followUpDate
                    ? followUpDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : "Pick a follow-up date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={followUpDate}
                  onSelect={setFollowUpDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Notes (always visible when outcome selected) */}
        {outcome && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              placeholder="Optional notes about the outreach..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px]"
              disabled={isPending}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!outcome || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Outcome"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
