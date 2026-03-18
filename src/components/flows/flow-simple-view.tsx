"use client"

import { useState, useMemo } from "react"
import type { Node, Edge } from "@xyflow/react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import {
  Play,
  MessageSquare,
  GitBranch,
  MessageCircle,
  Zap,
  Clock,
  GitMerge,
  Square,
  ChevronRight,
  CornerDownRight,
  RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineStep {
  id: string
  stepNumber: number
  node: Node
  summary: string
  details?: string
  branches?: TimelineBranch[]
  /** For nudge/timeout loops, note what happens on no response */
  timeoutNote?: string
  /** Sub-steps that follow sequentially after this step */
  continuation?: TimelineStep[]
}

interface TimelineBranch {
  label: string
  steps: TimelineStep[]
}

// ---------------------------------------------------------------------------
// Icon + color helpers
// ---------------------------------------------------------------------------

const NODE_META: Record<
  string,
  { icon: typeof Play; color: string; bg: string; label: string }
> = {
  start: {
    icon: Play,
    color: "text-green-600",
    bg: "bg-green-100 dark:bg-green-950",
    label: "Start",
  },
  message: {
    icon: MessageSquare,
    color: "text-blue-600",
    bg: "bg-blue-100 dark:bg-blue-950",
    label: "Message",
  },
  decision: {
    icon: GitBranch,
    color: "text-amber-600",
    bg: "bg-amber-100 dark:bg-amber-950",
    label: "Decision",
  },
  feedback_collect: {
    icon: MessageCircle,
    color: "text-purple-600",
    bg: "bg-purple-100 dark:bg-purple-950",
    label: "Feedback",
  },
  action: {
    icon: Zap,
    color: "text-red-600",
    bg: "bg-red-100 dark:bg-red-950",
    label: "Action",
  },
  delay: {
    icon: Clock,
    color: "text-teal-600",
    bg: "bg-teal-100 dark:bg-teal-950",
    label: "Delay",
  },
  condition: {
    icon: GitMerge,
    color: "text-yellow-600",
    bg: "bg-yellow-100 dark:bg-yellow-950",
    label: "Check",
  },
  end: {
    icon: Square,
    color: "text-gray-500",
    bg: "bg-gray-100 dark:bg-gray-800",
    label: "End",
  },
}

function getMeta(type?: string) {
  return NODE_META[type || ""] || NODE_META.message
}

// ---------------------------------------------------------------------------
// Summarisation helpers
// ---------------------------------------------------------------------------

function humanDuration(ms: number): string {
  if (ms >= 86400000) {
    const days = Math.round(ms / 86400000)
    return `${days} day${days !== 1 ? "s" : ""}`
  }
  const hours = Math.round(ms / 3600000)
  return `${hours} hour${hours !== 1 ? "s" : ""}`
}

function summariseNode(node: Node): string {
  const data = node.data as Record<string, any>
  const config = (data.config || {}) as Record<string, any>
  const label = (data.label as string) || ""

  switch (node.type) {
    case "start":
      return `Flow begins when a ${config.triggerType === "webhook" ? "new match is assigned" : config.triggerType || "trigger fires"}`

    case "message": {
      const tpl = (config.template as string) || ""
      // Take first sentence or first 120 chars
      const firstSentence = tpl.split(/[.!?\n]/)[0]?.trim() || ""
      const preview =
        firstSentence.length > 120
          ? firstSentence.slice(0, 120) + "..."
          : firstSentence
      return preview || label
    }

    case "decision": {
      const options = (config.options || []) as Array<{
        label: string
        value: string
      }>
      const optLabels = options.map((o) => `"${o.label}"`).join(", ")
      return `Member chooses: ${optLabels}`
    }

    case "feedback_collect": {
      const prompt = (config.prompt as string) || ""
      const preview =
        prompt.length > 120 ? prompt.slice(0, 120) + "..." : prompt
      return preview || `Collect ${config.feedbackType || "feedback"}`
    }

    case "action": {
      const actionLabels: Record<string, string> = {
        sync_to_sma: "Save feedback to match records",
        notify_admin: "Notify admin team",
        update_match_status: "Update match status",
        create_stripe_link: "Create payment link",
        send_introduction: "Send introduction",
        create_group_chat: "Create group chat",
        schedule_recalibration: "Schedule recalibration call",
        expire_match: "Move match to Past Introductions",
      }
      return actionLabels[config.actionType] || label
    }

    case "delay": {
      const dur = config.duration || 0
      const unit = config.unit || "hours"
      return `Wait ${dur} ${unit}`
    }

    case "condition": {
      const expr = (config.expression as string) || ""
      if (expr.includes("rejectionCount >= 3")) {
        return "Check if member has declined 3 or more matches"
      }
      return `Check: ${expr}`
    }

    case "end": {
      const endType = config.endType || "completed"
      return `Flow ends (${endType})`
    }

    default:
      return label
  }
}

function getNodeDetails(node: Node): string | undefined {
  const data = node.data as Record<string, any>
  const config = (data.config || {}) as Record<string, any>

  switch (node.type) {
    case "message":
      return config.template || undefined
    case "decision":
      return config.question || undefined
    case "feedback_collect": {
      const cats = (config.categories || []) as string[]
      if (cats.length > 0) {
        return `Options: ${cats.join(" | ")}`
      }
      return config.allowFreeText ? "Free text or voice note" : undefined
    }
    case "action": {
      const params = config.params || {}
      if (params.note) return params.note
      if (params.notification) return params.notification
      if (params.actions && Array.isArray(params.actions)) {
        return params.actions.join(". ")
      }
      return undefined
    }
    case "condition":
      return config.expression || undefined
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Graph traversal — build the structured timeline from nodes + edges
// ---------------------------------------------------------------------------

function buildTimeline(nodes: Node[], edges: Edge[]): TimelineStep[] {
  const nodeMap = new Map<string, Node>()
  nodes.forEach((n) => nodeMap.set(n.id, n))

  const edgesBySource = new Map<string, Edge[]>()
  edges.forEach((e) => {
    const list = edgesBySource.get(e.source) || []
    list.push(e)
    edgesBySource.set(e.source, list)
  })

  // Track visited to avoid infinite loops
  const visited = new Set<string>()
  let stepCounter = 0

  function walkLinear(nodeId: string): TimelineStep[] {
    const steps: TimelineStep[] = []
    let currentId: string | null = nodeId

    while (currentId) {
      if (visited.has(currentId)) {
        // Loop back detected — add a note
        const loopNode = nodeMap.get(currentId)
        if (loopNode) {
          steps.push({
            id: `loop_${currentId}`,
            stepNumber: 0, // will renumber
            node: loopNode,
            summary: `Return to "${(loopNode.data as any).label || currentId}"`,
          })
        }
        break
      }

      const node = nodeMap.get(currentId)
      if (!node) break

      visited.add(currentId)
      stepCounter++

      const outEdges: Edge[] = edgesBySource.get(currentId) || []

      // Filter out timeout/nudge edges for the main display
      const mainEdges: Edge[] = outEdges.filter(
        (e: Edge) => e.sourceHandle !== "timeout"
      )
      const timeoutEdge = outEdges.find(
        (e: Edge) => e.sourceHandle === "timeout"
      )

      // Determine what type of step this is
      if (
        node.type === "decision" ||
        (node.type === "condition" && mainEdges.length > 1)
      ) {
        // Branch point — build sub-branches
        const config = ((node.data as any).config || {}) as Record<
          string,
          any
        >
        const options = (config.options || []) as Array<{
          label: string
          value: string
          edgeId: string
        }>

        let branches: TimelineBranch[] = []

        if (node.type === "decision" && options.length > 0) {
          branches = options.map((opt) => {
            const edge = mainEdges.find(
              (e: Edge) => e.sourceHandle === opt.edgeId || e.id === opt.edgeId
            )
            const targetId = edge?.target
            return {
              label: `If member says "${opt.label}"`,
              steps: targetId ? walkLinear(targetId) : [],
            }
          })
        } else if (node.type === "condition") {
          // Condition: true/false branches
          const trueEdge = mainEdges.find(
            (e: Edge) => e.sourceHandle === "true"
          )
          const falseEdge = mainEdges.find(
            (e: Edge) => e.sourceHandle === "false"
          )
          const trueLabel =
            trueEdge?.label?.toString() || "If condition is true"
          const falseLabel =
            falseEdge?.label?.toString() || "If condition is false"

          branches = [
            {
              label: trueLabel,
              steps: trueEdge?.target
                ? walkLinear(trueEdge.target)
                : [],
            },
            {
              label: falseLabel,
              steps: falseEdge?.target
                ? walkLinear(falseEdge.target)
                : [],
            },
          ]
        }

        let timeoutNote: string | undefined
        if (timeoutEdge) {
          const timeoutMs = config.timeout as number | undefined
          const timeoutTarget = nodeMap.get(timeoutEdge.target)
          const targetLabel =
            (timeoutTarget?.data as any)?.label || "follow-up"
          timeoutNote = timeoutMs
            ? `If no response after ${humanDuration(timeoutMs)}, send ${targetLabel.toLowerCase()}`
            : `If no response, send ${targetLabel.toLowerCase()}`
        }

        steps.push({
          id: currentId,
          stepNumber: stepCounter,
          node,
          summary: summariseNode(node),
          details: getNodeDetails(node),
          branches,
          timeoutNote,
        })

        // Decision points are terminal for this linear chain
        currentId = null
      } else {
        // Linear step (message, action, feedback, end, etc.)
        const step: TimelineStep = {
          id: currentId,
          stepNumber: stepCounter,
          node,
          summary: summariseNode(node),
          details: getNodeDetails(node),
        }

        let timeoutNote: string | undefined
        if (timeoutEdge) {
          const config = ((node.data as any).config || {}) as Record<
            string,
            any
          >
          const timeoutMs = config.timeout as number | undefined
          timeoutNote = timeoutMs
            ? `If no response after ${humanDuration(timeoutMs)}, a reminder is sent`
            : undefined
          step.timeoutNote = timeoutNote
        }

        steps.push(step)

        if (node.type === "end") {
          currentId = null
        } else if (mainEdges.length === 1) {
          currentId = mainEdges[0].target
        } else if (mainEdges.length === 0) {
          currentId = null
        } else {
          // Multiple non-option edges (shouldn't happen often) — take first
          currentId = mainEdges[0].target
        }
      }
    }

    return steps
  }

  // Find the start node
  const startNode = nodes.find((n) => n.type === "start")
  if (!startNode) return []

  const timeline = walkLinear(startNode.id)

  // Renumber for display (skip loop-back markers)
  let displayNum = 0
  function renumber(steps: TimelineStep[]) {
    for (const step of steps) {
      if (step.id.startsWith("loop_")) {
        step.stepNumber = 0
      } else {
        displayNum++
        step.stepNumber = displayNum
      }
      if (step.branches) {
        for (const branch of step.branches) {
          renumber(branch.steps)
        }
      }
      if (step.continuation) {
        renumber(step.continuation)
      }
    }
  }
  renumber(timeline)

  return timeline
}

// ---------------------------------------------------------------------------
// Render components
// ---------------------------------------------------------------------------

function StepIcon({ type }: { type?: string }) {
  const meta = getMeta(type)
  const Icon = meta.icon
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        meta.bg,
        meta.color
      )}
    >
      <Icon className="size-4" />
    </div>
  )
}

function StepBadge({ type }: { type?: string }) {
  const meta = getMeta(type)
  return (
    <Badge variant="outline" className={cn("text-[10px]", meta.color)}>
      {meta.label}
    </Badge>
  )
}

function TimelineStepItem({
  step,
  isLast,
  depth,
}: {
  step: TimelineStep
  isLast: boolean
  depth: number
}) {
  const [open, setOpen] = useState(false)
  const hasDetails =
    step.details || (step.branches && step.branches.length > 0)
  const isLoopBack = step.id.startsWith("loop_")
  const nodeType = step.node.type || ""
  const nodeLabel = (step.node.data as any).label || ""

  if (isLoopBack) {
    return (
      <div className="flex items-center gap-3 py-1.5 pl-1">
        <div className="flex size-8 shrink-0 items-center justify-center">
          <RotateCcw className="size-4 text-muted-foreground" />
        </div>
        <span className="text-xs italic text-muted-foreground">
          Return to "{nodeLabel}"
        </span>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical connector line */}
      {!isLast && (
        <div className="absolute left-[15px] top-10 bottom-0 w-px bg-border" />
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Step header — always visible */}
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left transition-colors",
            hasDetails && "hover:bg-accent/50 cursor-pointer",
            !hasDetails && "cursor-default"
          )}
          disabled={!hasDetails}
        >
          {/* Step number + icon */}
          <div className="relative">
            <StepIcon type={nodeType} />
            {step.stepNumber > 0 && (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">
                {step.stepNumber}
              </span>
            )}
          </div>

          {/* Text content */}
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium leading-tight">
                {nodeLabel}
              </span>
              <StepBadge type={nodeType} />
              {hasDetails && (
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-90"
                  )}
                />
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {step.summary}
            </p>
            {step.timeoutNote && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] italic text-muted-foreground/70">
                <Clock className="size-3" />
                {step.timeoutNote}
              </p>
            )}
          </div>
        </CollapsibleTrigger>

        {/* Expanded details */}
        {hasDetails && (
          <CollapsibleContent>
            <div className="ml-11 pb-2">
              {/* Full text detail */}
              {step.details && !step.branches?.length && (
                <div className="rounded-md border bg-muted/50 px-3 py-2">
                  <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                    {step.details}
                  </p>
                </div>
              )}

              {/* Decision full question text */}
              {step.details && step.branches && step.branches.length > 0 && (
                <div className="mb-2 rounded-md border bg-muted/50 px-3 py-2">
                  <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                    {step.details}
                  </p>
                </div>
              )}

              {/* Branches */}
              {step.branches && step.branches.length > 0 && (
                <div className="space-y-2">
                  {step.branches.map((branch, idx) => (
                    <BranchSection
                      key={idx}
                      branch={branch}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}

function BranchSection({
  branch,
  depth,
}: {
  branch: TimelineBranch
  depth: number
}) {
  const [open, setOpen] = useState(false)
  const hasSteps = branch.steps.length > 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors",
          hasSteps && "hover:bg-accent/50 cursor-pointer",
          !hasSteps && "cursor-default opacity-60"
        )}
        disabled={!hasSteps}
      >
        <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium">{branch.label}</span>
        {hasSteps && (
          <>
            <span className="text-[10px] text-muted-foreground">
              {branch.steps.length} step{branch.steps.length !== 1 ? "s" : ""}
            </span>
            <ChevronRight
              className={cn(
                "size-3 text-muted-foreground transition-transform",
                open && "rotate-90"
              )}
            />
          </>
        )}
      </CollapsibleTrigger>

      {hasSteps && (
        <CollapsibleContent>
          <div className="ml-4 mt-1 border-l pl-3">
            {branch.steps.map((step, idx) => (
              <TimelineStepItem
                key={step.id}
                step={step}
                isLast={idx === branch.steps.length - 1}
                depth={depth}
              />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

interface FlowSimpleViewProps {
  nodes: Node[]
  edges: Edge[]
  flowName: string
}

export function FlowSimpleView({ nodes, edges, flowName }: FlowSimpleViewProps) {
  const timeline = useMemo(
    () => buildTimeline(nodes, edges),
    [nodes, edges]
  )

  if (timeline.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">No flow steps to display</p>
      </div>
    )
  }

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{flowName}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Read the automation top-to-bottom. Expand any step for details.
        </p>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {timeline.map((step, idx) => (
          <TimelineStepItem
            key={step.id}
            step={step}
            isLast={idx === timeline.length - 1}
            depth={0}
          />
        ))}
      </div>
    </div>
  )
}
