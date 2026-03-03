"use client"

import {
  Play,
  MessageSquare,
  GitBranch,
  MessageCircle,
  Zap,
  Clock,
  GitMerge,
  Square,
} from "lucide-react"

const NODE_PALETTE_ITEMS = [
  {
    type: "start",
    label: "Start",
    icon: Play,
    color: "bg-green-500",
    description: "Flow entry point",
  },
  {
    type: "message",
    label: "Message",
    icon: MessageSquare,
    color: "bg-blue-500",
    description: "Send a message",
  },
  {
    type: "decision",
    label: "Decision",
    icon: GitBranch,
    color: "bg-amber-500",
    description: "Branch based on choice",
  },
  {
    type: "feedback_collect",
    label: "Feedback",
    icon: MessageCircle,
    color: "bg-purple-500",
    description: "Collect feedback",
  },
  {
    type: "action",
    label: "Action",
    icon: Zap,
    color: "bg-red-500",
    description: "Execute an action",
  },
  {
    type: "delay",
    label: "Delay",
    icon: Clock,
    color: "bg-teal-500",
    description: "Wait for a duration",
  },
  {
    type: "condition",
    label: "Condition",
    icon: GitMerge,
    color: "bg-yellow-500",
    description: "True/false branch",
  },
  {
    type: "end",
    label: "End",
    icon: Square,
    color: "bg-gray-500",
    description: "Flow exit point",
  },
]

export function NodePalette() {
  const onDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    nodeType: string
  ) => {
    event.dataTransfer.setData("application/reactflow", nodeType)
    event.dataTransfer.effectAllowed = "move"
  }

  return (
    <div className="flex h-full w-56 flex-col border-r bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Node Types</h3>
        <p className="text-[10px] text-muted-foreground">
          Drag to canvas to add
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {NODE_PALETTE_ITEMS.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              className="flex cursor-grab items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent active:cursor-grabbing"
            >
              <div
                className={`flex size-8 items-center justify-center rounded-md ${item.color} text-white`}
              >
                <item.icon className="size-4" />
              </div>
              <div>
                <p className="text-xs font-medium">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
