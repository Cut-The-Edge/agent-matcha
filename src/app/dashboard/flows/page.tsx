"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { Node, Edge } from "@xyflow/react"

import { FlowEditor } from "@/components/flows/flow-editor"
import { useFlowEditorStore } from "@/stores/flow-editor-store"
import {
  defaultNodes as daniFlowNodes,
  defaultEdges as daniFlowEdges,
} from "@/components/flows/default-flow-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  Save,
  Circle,
  Workflow,
} from "lucide-react"

export default function FlowsPage() {
  const router = useRouter()

  // Auto-load the active match_feedback flow
  const activeFlow = useQuery(api.engine.queries.getActiveFlow, {
    type: "match_feedback",
  })

  // If no active flow, check if any flow exists at all
  const allFlows = useQuery(api.engine.queries.listFlowDefinitions, {})

  const saveFlowDefinition = useMutation(api.engine.mutations.saveFlowDefinition)

  const [isSeeding, setIsSeeding] = useState(false)

  // Auto-seed flow if none exist
  const handleSeedDefault = async () => {
    setIsSeeding(true)
    try {
      const store = useFlowEditorStore.getState()
      const convexNodes = daniFlowNodes.map((n) => ({
        nodeId: n.id,
        type: n.type || "unknown",
        label: (n.data.label as string) || "",
        position: { x: n.position.x, y: n.position.y },
        config: (n.data.config as any) || {},
      }))
      const convexEdges = daniFlowEdges.map((e) => ({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        label: (e.label as string) || undefined,
        condition: e.sourceHandle || undefined,
      }))
      await saveFlowDefinition({
        name: "Match Introduction Flow",
        type: "match_feedback",
        nodes: convexNodes,
        edges: convexEdges,
      })
    } catch (error) {
      console.error("Failed to seed flow:", error)
    } finally {
      setIsSeeding(false)
    }
  }

  // Loading state
  if (activeFlow === undefined) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-6 w-48" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="flex-1">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    )
  }

  // No active flow — prompt to seed
  if (!activeFlow) {
    // Check if there's an inactive flow to use
    const existingFlow = allFlows?.find((f: any) => f.type === "match_feedback")
    if (existingFlow) {
      return <FlowEditorPage flowId={existingFlow._id} />
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Workflow className="size-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">No Flow Configured</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create the Match Introduction Flow to get started
          </p>
        </div>
        <Button onClick={handleSeedDefault} disabled={isSeeding}>
          {isSeeding ? "Creating..." : "Create Match Introduction Flow"}
        </Button>
      </div>
    )
  }

  // Active flow found — render editor directly
  return <FlowEditorPage flowId={activeFlow._id} />
}

// ============================================================================
// Editor Page
// ============================================================================

function FlowEditorPage({
  flowId,
}: {
  flowId: Id<"flowDefinitions">
}) {
  const router = useRouter()
  const flowData = useQuery(
    api.engine.queries.getFlowDefinition,
    { flowDefinitionId: flowId }
  )

  const saveFlowDefinition = useMutation(api.engine.mutations.saveFlowDefinition)
  const activateFlowDefinition = useMutation(
    api.engine.mutations.activateFlowDefinition
  )

  const {
    nodes,
    edges,
    flowName,
    flowType,
    flowDefinitionId,
    isDirty,
    setNodes,
    setEdges,
    setFlowMeta,
    markClean,
  } = useFlowEditorStore()

  const [isSaving, setIsSaving] = useState(false)
  const [isActive, setIsActive] = useState(false)

  // Load flow data into store when it arrives
  useEffect(() => {
    if (flowData) {
      const rfNodes: Node[] = flowData.nodes.map((n: any) => ({
        id: n.nodeId,
        type: n.type,
        position: n.position,
        data: {
          label: n.label,
          config: n.config,
        },
      }))

      const rfEdges: Edge[] = flowData.edges.map((e: any) => ({
        id: e.edgeId,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "smoothstep",
        animated: true,
        ...(e.condition ? { sourceHandle: e.condition } : {}),
      }))

      setNodes(rfNodes)
      setEdges(rfEdges)
      setFlowMeta({
        flowDefinitionId: flowId as string,
        flowName: flowData.name,
        flowType: flowData.type,
      })
      setIsActive(flowData.isActive)
      markClean()
    }
  }, [flowData, flowId, setNodes, setEdges, setFlowMeta, markClean])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const convexNodes = nodes.map((n) => ({
        nodeId: n.id,
        type: n.type || "unknown",
        label: (n.data.label as string) || "",
        position: { x: n.position.x, y: n.position.y },
        config: (n.data.config as any) || {},
      }))

      const convexEdges = edges.map((e) => ({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        label: (e.label as string) || undefined,
        condition: e.sourceHandle || undefined,
      }))

      const result = await saveFlowDefinition({
        flowDefinitionId: flowDefinitionId
          ? (flowDefinitionId as Id<"flowDefinitions">)
          : undefined,
        name: flowName,
        type: flowType,
        nodes: convexNodes,
        edges: convexEdges,
      })

      if (!flowDefinitionId) {
        setFlowMeta({
          flowDefinitionId: result as string,
          flowName,
          flowType,
        })
      }

      markClean()
    } catch (error) {
      console.error("Failed to save flow:", error)
    } finally {
      setIsSaving(false)
    }
  }, [
    nodes,
    edges,
    flowName,
    flowType,
    flowDefinitionId,
    saveFlowDefinition,
    setFlowMeta,
    markClean,
  ])

  const handleToggleActive = useCallback(async () => {
    if (!flowDefinitionId) return

    try {
      if (!isActive) {
        await activateFlowDefinition({
          flowDefinitionId: flowDefinitionId as Id<"flowDefinitions">,
        })
        setIsActive(true)
      }
    } catch (error) {
      console.error("Failed to toggle active:", error)
    }
  }, [flowDefinitionId, isActive, activateFlowDefinition])

  // Loading state
  if (flowData === undefined) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-6 w-48" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="flex-1">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] flex-col">
      {/* Editor Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Button>

        <div className="h-6 w-px bg-border" />

        <h3 className="text-sm font-semibold">{flowName}</h3>

        <Badge variant="secondary" className="text-[10px]">
          {flowType}
        </Badge>

        {isDirty && (
          <span className="text-xs text-amber-500">Unsaved changes</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {flowDefinitionId && (
            <div className="flex items-center gap-2">
              <Switch
                checked={isActive}
                onCheckedChange={handleToggleActive}
                size="sm"
              />
              <Label className="flex items-center gap-1 text-xs">
                <Circle
                  className={`size-2 fill-current ${
                    isActive ? "text-green-500" : "text-gray-300"
                  }`}
                />
                {isActive ? "Active" : "Inactive"}
              </Label>
            </div>
          )}

          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
          >
            <Save className="mr-1 size-4" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Editor Canvas */}
      <div className="flex-1">
        <FlowEditor />
      </div>
    </div>
  )
}
