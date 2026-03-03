"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Workflow, Zap, Circle, Trash2 } from "lucide-react"
import { useMutation } from "convex/react"
import type { Id, Doc } from "../../../convex/_generated/dataModel"

interface FlowListProps {
  onSelectFlow: (flowId: Id<"flowDefinitions">) => void
  onCreateNew: () => void
  onSeedDefault: () => void
}

export function FlowList({
  onSelectFlow,
  onCreateNew,
  onSeedDefault,
}: FlowListProps) {
  const flows = useQuery(api.engine.queries.listFlowDefinitions, {}) as Doc<"flowDefinitions">[] | undefined
  const deleteFlow = useMutation(api.engine.mutations.deleteFlowDefinition)

  if (flows === undefined) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Flow Editor</h2>
          <p className="text-muted-foreground">
            Design and manage conversation flows for your WhatsApp bot.
          </p>
        </div>
        <div className="flex gap-2">
          {flows.length === 0 && (
            <Button variant="outline" onClick={onSeedDefault}>
              <Zap className="mr-2 size-4" />
              Seed Default Flow
            </Button>
          )}
          <Button onClick={onCreateNew}>
            <Plus className="mr-2 size-4" />
            Create New Flow
          </Button>
        </div>
      </div>

      {flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 lg:px-6">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <Workflow className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No flows yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a new flow or seed the default match feedback flow to get
            started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 px-4 md:grid-cols-2 lg:grid-cols-3 lg:px-6">
          {flows.map((flow) => (
            <Card
              key={flow._id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => onSelectFlow(flow._id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{flow.name}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Circle
                      className={`size-2.5 fill-current ${
                        flow.isActive ? "text-green-500" : "text-gray-300"
                      }`}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {flow.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <CardDescription>
                  {flow.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{flow.type}</Badge>
                  <Badge variant="outline">v{flow.version}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {flow.nodes.length} node{flow.nodes.length !== 1 ? "s" : ""}
                    {" / "}
                    {flow.edges.length} edge{flow.edges.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {flow.isDefault ? (
                    <Badge variant="default">Default</Badge>
                  ) : (
                    <span />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete "${flow.name}"? This will also remove all its instances and logs.`)) {
                        deleteFlow({ flowDefinitionId: flow._id })
                      }
                    }}
                  >
                    <Trash2 className="mr-1 size-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
