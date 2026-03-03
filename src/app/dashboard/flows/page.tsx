"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { Node, Edge } from "@xyflow/react"

import { FlowEditor } from "@/components/flows/flow-editor"
import { FlowList } from "@/components/flows/flow-list"
import { useFlowEditorStore } from "@/stores/flow-editor-store"
import {
  defaultNodes as daniFlowNodes,
  defaultEdges as daniFlowEdges,
} from "@/components/flows/default-flow-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  Save,
  Circle,
} from "lucide-react"

export default function FlowsPage() {
  const [selectedFlowId, setSelectedFlowId] = useState<
    Id<"flowDefinitions"> | null
  >(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  // Show the editor if a flow is selected or if creating new
  const isEditing = selectedFlowId !== null || isCreatingNew

  const handleSelectFlow = (flowId: Id<"flowDefinitions">) => {
    setSelectedFlowId(flowId)
    setIsCreatingNew(false)
  }

  const handleCreateNew = () => {
    setIsCreatingNew(true)
    setSelectedFlowId(null)

    const store = useFlowEditorStore.getState()
    store.setNodes([])
    store.setEdges([])
    store.setFlowMeta({
      flowDefinitionId: null,
      flowName: "New Flow",
      flowType: "match_feedback",
    })
    store.markClean()
  }

  const handleSeedDefault = () => {
    // Seed Dani's full Match Introduction Flow
    const store = useFlowEditorStore.getState()
    setIsCreatingNew(true)
    setSelectedFlowId(null)

    store.setNodes(daniFlowNodes)
    store.setEdges(daniFlowEdges)
    store.setFlowMeta({
      flowDefinitionId: null,
      flowName: "Match Introduction Flow",
      flowType: "match_feedback",
    })
    store.markDirty()
  }

  const handleBack = () => {
    setSelectedFlowId(null)
    setIsCreatingNew(false)
  }

  if (isEditing) {
    return (
      <FlowEditorPage
        flowId={selectedFlowId}
        onBack={handleBack}
      />
    )
  }

  return (
    <FlowList
      onSelectFlow={handleSelectFlow}
      onCreateNew={handleCreateNew}
      onSeedDefault={handleSeedDefault}
    />
  )
}

// ============================================================================
// Editor Page (when a flow is selected or being created)
// ============================================================================

function FlowEditorPage({
  flowId,
  onBack,
}: {
  flowId: Id<"flowDefinitions"> | null
  onBack: () => void
}) {
  const flowData = useQuery(
    api.engine.queries.getFlowDefinition,
    flowId ? { flowDefinitionId: flowId } : "skip"
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
    if (flowData && flowId) {
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
        flowDefinitionId: flowId,
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
      // Convert React Flow nodes/edges back to the Convex format
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

      // If this was a new flow, update the store with the new ID
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
      // Note: there is no "deactivateFlowDefinition" mutation in the backend.
      // The activation mutation deactivates other flows of the same type.
      // For toggling off, you would need to add that to the backend.
    } catch (error) {
      console.error("Failed to toggle active:", error)
    }
  }, [flowDefinitionId, isActive, activateFlowDefinition])

  // Loading state for an existing flow
  if (flowId && flowData === undefined) {
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
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Button>

        <div className="h-6 w-px bg-border" />

        <Input
          value={flowName}
          onChange={(e) =>
            useFlowEditorStore.getState().setFlowMeta({
              flowDefinitionId,
              flowName: e.target.value,
              flowType,
            })
          }
          className="h-8 w-56 text-sm font-medium"
        />

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
