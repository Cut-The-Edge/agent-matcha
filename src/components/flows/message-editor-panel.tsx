"use client"

import { useState, useCallback, useEffect, useMemo, useRef, Fragment } from "react"
import { useFlowEditorStore, type MessageEditItem, type SaveStatus } from "@/stores/flow-editor-store"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  X,
  MessageSquare,
  HelpCircle,
  Save,
  Undo2,
  Check,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from "lucide-react"

// ============================================================================
// Template variable definitions
// ============================================================================

const TEMPLATE_VARIABLES: Record<string, string> = {
  "{{memberFirstName}}": "The member's first name",
  "{{memberName}}": "The member's full name",
  "{{matchFirstName}}": "The match's first name",
  "{{matchName}}": "The match's full name",
  "{{profileLink}}": "Link to the match's profile page",
  "{{recalibrationLink}}": "Link to book a recalibration call",
  "{{memberLastName}}": "The member's last name",
  "{{matchLastName}}": "The match's last name",
}

// ============================================================================
// Save Status Indicator
// ============================================================================

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status.state === "idle") return null

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status.state === "saving" && (
        <>
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Saving...</span>
        </>
      )}
      {status.state === "saved" && (
        <>
          <Check className="size-3 text-green-600" />
          <span className="text-green-600">
            Saved {formatTimestamp(status.timestamp)}
          </span>
        </>
      )}
      {status.state === "error" && (
        <>
          <AlertTriangle className="size-3 text-destructive" />
          <span className="text-destructive">Failed to save</span>
        </>
      )}
    </div>
  )
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  if (diffMs < 60_000) return "just now"

  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `at ${hours}:${minutes}`
}

// ============================================================================
// Template Variable Highlighter
// ============================================================================

function HighlightedPreview({ text }: { text: string }) {
  const parts = text.split(/(\{\{[a-zA-Z_]+\}\})/g)

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, idx) => {
        const isVariable = /^\{\{[a-zA-Z_]+\}\}$/.test(part)

        if (isVariable && TEMPLATE_VARIABLES[part]) {
          return (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help rounded bg-violet-100 px-1 py-0.5 font-mono text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  {part}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{TEMPLATE_VARIABLES[part]}</p>
              </TooltipContent>
            </Tooltip>
          )
        }

        return <Fragment key={idx}>{part}</Fragment>
      })}
    </div>
  )
}

// ============================================================================
// Message Navigation List
// ============================================================================

function MessageNavItem({
  item,
  isActive,
  onClick,
}: {
  item: MessageEditItem
  isActive: boolean
  onClick: () => void
}) {
  const preview =
    item.text.length > 60 ? item.text.slice(0, 60) + "..." : item.text

  const typeColor = {
    message: "bg-blue-500",
    decision: "bg-amber-500",
    feedback_collect: "bg-emerald-500",
    delay: "bg-purple-500",
  }[item.nodeType] || "bg-gray-500"

  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        isActive
          ? "bg-primary/10 border border-primary/20"
          : "hover:bg-muted/60 border border-transparent"
      }`}
    >
      <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
        <span className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${typeColor}`}>
          {item.stepNumber}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-medium">{item.label}</p>
          <ChevronRight className={`size-3 shrink-0 text-muted-foreground transition-transform ${isActive ? "rotate-90" : ""}`} />
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{item.contextLabel}</p>
        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">
          {preview}
        </p>
      </div>
    </button>
  )
}

// ============================================================================
// Message Edit View
// ============================================================================

function MessageEditView({
  item,
  draft,
  onDraftChange,
  onSave,
  onRevert,
  saveStatus,
  onRetry,
}: {
  item: MessageEditItem
  draft: string
  onDraftChange: (text: string) => void
  onSave: () => void
  onRevert: () => void
  saveStatus: SaveStatus
  onRetry: () => void
}) {
  const isDraftChanged = draft !== item.text
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when switching messages
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [item.nodeId])

  const typeLabel = {
    message: "Message Node",
    decision: "Decision Prompt",
    feedback_collect: "Feedback Prompt",
    delay: "Delay Reminder",
  }[item.nodeType] || "Node"

  const typeBadgeVariant = {
    message: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    decision: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    feedback_collect: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    delay: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  }[item.nodeType] || ""

  // Detect template variables in the current draft
  const variablesInText = useMemo(() => {
    const found: string[] = []
    const pattern = /\{\{[a-zA-Z_]+\}\}/g
    let match
    while ((match = pattern.exec(draft)) !== null) {
      if (TEMPLATE_VARIABLES[match[0]] && !found.includes(match[0])) {
        found.push(match[0])
      }
    }
    return found
  }, [draft])

  return (
    <div className="flex h-full flex-col">
      {/* Edit header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">{item.label}</h4>
          <Badge variant="secondary" className={`text-[10px] ${typeBadgeVariant}`}>
            {typeLabel}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Step {item.stepNumber} &middot; {item.contextLabel}
        </p>
      </div>

      {/* Edit body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Textarea */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Message text
          </label>
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            className="min-h-[160px] font-mono text-xs"
            placeholder="Enter message text..."
          />
        </div>

        {/* Template variables legend */}
        {variablesInText.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="size-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Template variables used
              </span>
            </div>
            <div className="space-y-1">
              {variablesInText.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    {v}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {TEMPLATE_VARIABLES[v]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live preview */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Preview
          </span>
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
            <HighlightedPreview text={draft} />
          </div>
        </div>
      </div>

      {/* Edit footer */}
      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-between">
          <SaveStatusIndicator status={saveStatus} />
          <div className="flex items-center gap-2">
            {saveStatus.state === "error" && (
              <Button variant="destructive" size="sm" onClick={onRetry}>
                <AlertTriangle className="mr-1 size-3" />
                Retry
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRevert}
              disabled={!isDraftChanged}
            >
              <Undo2 className="mr-1 size-3" />
              Revert
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={!isDraftChanged || saveStatus.state === "saving"}
            >
              <Save className="mr-1 size-3" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Message Editor Panel
// ============================================================================

export function MessageEditorPanel() {
  const {
    nodes,
    edges,
    editingMessageId,
    editingMessageDraft,
    messageSaveStatus,
    closeMessageEditor,
    selectMessage,
    setEditingDraft,
    setMessageSaveStatus,
    updateNodeData,
    getMessageItems,
    hasUnsavedMessageDraft,
    markDirty,
  } = useFlowEditorStore()

  const [confirmNavTarget, setConfirmNavTarget] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const items = useMemo(() => getMessageItems(), [nodes, edges, getMessageItems])

  const activeItem = useMemo(
    () => items.find((i) => i.nodeId === editingMessageId) || null,
    [items, editingMessageId]
  )

  // Compute the draft: use store draft if set, otherwise fall back to source text
  const currentDraft = editingMessageDraft ?? activeItem?.text ?? ""

  // Handle navigation with unsaved check
  const handleSelectMessage = useCallback(
    (nodeId: string) => {
      if (nodeId === editingMessageId) return
      if (hasUnsavedMessageDraft()) {
        setConfirmNavTarget(nodeId)
      } else {
        selectMessage(nodeId)
      }
    },
    [editingMessageId, hasUnsavedMessageDraft, selectMessage]
  )

  const handleClose = useCallback(() => {
    if (hasUnsavedMessageDraft()) {
      setConfirmClose(true)
    } else {
      closeMessageEditor()
    }
  }, [hasUnsavedMessageDraft, closeMessageEditor])

  const handleConfirmNav = useCallback(() => {
    if (confirmNavTarget) {
      selectMessage(confirmNavTarget)
      setConfirmNavTarget(null)
    }
  }, [confirmNavTarget, selectMessage])

  const handleConfirmClose = useCallback(() => {
    setConfirmClose(false)
    closeMessageEditor()
  }, [closeMessageEditor])

  // Save handler: writes draft into the node data via the store
  const handleSave = useCallback(() => {
    if (!activeItem || editingMessageDraft === null) return

    setMessageSaveStatus({ state: "saving" })

    try {
      // Build the config update based on which text field this node uses
      const configUpdate: Record<string, string> = {}
      configUpdate[activeItem.textField] = editingMessageDraft

      updateNodeData(activeItem.nodeId, {
        config: {
          ...((nodes.find((n) => n.id === activeItem.nodeId)?.data as any)?.config || {}),
          ...configUpdate,
        },
      })

      // Clear the draft since it's now synced with node data
      setEditingDraft(null)
      markDirty()

      setMessageSaveStatus({ state: "saved", timestamp: Date.now() })
    } catch (err: any) {
      setMessageSaveStatus({
        state: "error",
        error: err?.message || "Unknown error",
      })
    }
  }, [activeItem, editingMessageDraft, nodes, updateNodeData, setEditingDraft, setMessageSaveStatus, markDirty])

  const handleRevert = useCallback(() => {
    setEditingDraft(null)
    setMessageSaveStatus({ state: "idle" })
  }, [setEditingDraft, setMessageSaveStatus])

  const handleRetry = useCallback(() => {
    handleSave()
  }, [handleSave])

  return (
    <>
      <div className="flex h-full w-[640px] flex-col border-l bg-card">
        {/* Panel header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Edit Messages</h3>
            <Badge variant="secondary" className="text-[10px]">
              {items.length} messages
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Split: nav list + edit view */}
        <div className="flex flex-1 overflow-hidden">
          {/* Navigation sidebar */}
          <div className="w-[220px] shrink-0 border-r">
            <ScrollArea className="h-full">
              <div className="space-y-1 p-2">
                {items.map((item) => (
                  <MessageNavItem
                    key={item.nodeId}
                    item={item}
                    isActive={item.nodeId === editingMessageId}
                    onClick={() => handleSelectMessage(item.nodeId)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Edit view */}
          <div className="flex-1">
            {activeItem ? (
              <MessageEditView
                item={activeItem}
                draft={currentDraft}
                onDraftChange={(text) => setEditingDraft(text)}
                onSave={handleSave}
                onRevert={handleRevert}
                saveStatus={messageSaveStatus}
                onRetry={handleRetry}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a message to edit
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unsaved changes dialog -- navigation */}
      <AlertDialog
        open={!!confirmNavTarget}
        onOpenChange={(open) => !open && setConfirmNavTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this message. Are you sure you want to
              navigate away? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmNavTarget(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNav}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes dialog -- close panel */}
      <AlertDialog
        open={confirmClose}
        onOpenChange={(open) => !open && setConfirmClose(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close the
              editor? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmClose(false)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
