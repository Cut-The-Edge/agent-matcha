"use client"

import { useFlowEditorStore } from "@/stores/flow-editor-store"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { X, Plus, Trash2 } from "lucide-react"

const FEEDBACK_CATEGORIES = [
  "physical_attraction",
  "photos_only",
  "chemistry",
  "willingness_to_meet",
  "age_preference",
  "location",
  "career_income",
  "something_specific",
]

const ACTION_TYPES = [
  { value: "sync_to_sma", label: "Sync to SMA" },
  { value: "notify_admin", label: "Notify Admin" },
  { value: "update_match_status", label: "Update Match Status" },
  { value: "create_stripe_link", label: "Create Stripe Link" },
  { value: "send_introduction", label: "Send Introduction" },
  { value: "create_group_chat", label: "Create Group Chat" },
  { value: "schedule_recalibration", label: "Schedule Recalibration" },
]

const MATCH_STATUSES = [
  { value: "active", label: "Active Introductions" },
  { value: "rejected", label: "Rejected Introductions" },
  { value: "past", label: "Past Introductions" },
  { value: "potential", label: "Potential Introductions" },
  { value: "successful", label: "Successful Matches" },
  { value: "notSuitable", label: "Not Suitable" },
  { value: "automated", label: "Automated Intro" },
]

export function PropertiesPanel() {
  const { selectedNode, updateNodeData, deselectNode, deleteNode } =
    useFlowEditorStore()

  if (!selectedNode) return null

  const nodeType = selectedNode.type || "unknown"
  const data = selectedNode.data as Record<string, any>
  const config = (data.config || {}) as Record<string, any>

  const updateConfig = (updates: Record<string, any>) => {
    updateNodeData(selectedNode.id, {
      config: { ...config, ...updates },
    })
  }

  const updateLabel = (label: string) => {
    updateNodeData(selectedNode.id, { label })
  }

  return (
    <div className="flex h-full w-80 flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Node Properties</h3>
        <Button variant="ghost" size="sm" onClick={deselectNode}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {/* Common: Label */}
          <div className="space-y-2">
            <Label htmlFor="node-label">Label</Label>
            <Input
              id="node-label"
              value={(data.label as string) || ""}
              onChange={(e) => updateLabel(e.target.value)}
            />
          </div>

          {/* Type-specific fields */}
          {nodeType === "start" && (
            <StartFields config={config} updateConfig={updateConfig} />
          )}
          {nodeType === "message" && (
            <MessageFields config={config} updateConfig={updateConfig} />
          )}
          {nodeType === "decision" && (
            <DecisionFields config={config} updateConfig={updateConfig} />
          )}
          {nodeType === "feedback_collect" && (
            <FeedbackFields config={config} updateConfig={updateConfig} />
          )}
          {nodeType === "action" && (
            <ActionFields config={config} updateConfig={updateConfig} />
          )}
          {nodeType === "delay" && (
            <DelayFields config={config} updateConfig={updateConfig} />
          )}
          {nodeType === "condition" && (
            <ConditionFields config={config} updateConfig={updateConfig} />
          )}
          {nodeType === "end" && (
            <EndFields config={config} updateConfig={updateConfig} />
          )}
        </div>
      </div>

      {/* Footer: Delete */}
      <div className="border-t px-4 py-3">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => deleteNode(selectedNode.id)}
        >
          <Trash2 className="mr-2 size-4" />
          Delete Node
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Type-specific field components
// ============================================================================

function StartFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  return (
    <div className="space-y-2">
      <Label>Trigger Type</Label>
      <Select
        value={config.triggerType || "match_created"}
        onValueChange={(v) => updateConfig({ triggerType: v })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="match_created">Match Created</SelectItem>
          <SelectItem value="manual">Manual</SelectItem>
          <SelectItem value="scheduled">Scheduled</SelectItem>
          <SelectItem value="webhook">Webhook</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function MessageFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Message Template</Label>
        <Textarea
          rows={5}
          value={config.template || ""}
          onChange={(e) => updateConfig({ template: e.target.value })}
          placeholder="Enter message template text..."
        />
        <p className="text-[10px] text-muted-foreground">
          Use {"{{memberName}}"}, {"{{matchName}}"} for variables
        </p>
      </div>
      <div className="space-y-2">
        <Label>Channel</Label>
        <Select
          value={config.channel || "whatsapp"}
          onValueChange={(v) => updateConfig({ channel: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Media URL (optional)</Label>
        <Input
          value={config.mediaUrl || ""}
          onChange={(e) => updateConfig({ mediaUrl: e.target.value })}
          placeholder="https://..."
        />
      </div>
    </>
  )
}

function DecisionFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  const options = (config.options || []) as Array<{
    value: string
    label: string
    edgeId: string
  }>

  const addOption = () => {
    const newOption = {
      value: `option_${options.length + 1}`,
      label: `Option ${options.length + 1}`,
      edgeId: `edge_opt_${Date.now()}`,
    }
    updateConfig({ options: [...options, newOption] })
  }

  const removeOption = (idx: number) => {
    updateConfig({ options: options.filter((_, i) => i !== idx) })
  }

  const updateOption = (idx: number, field: string, value: string) => {
    const updated = options.map((opt, i) =>
      i === idx ? { ...opt, [field]: value } : opt
    )
    updateConfig({ options: updated })
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Question Text</Label>
        <Textarea
          rows={3}
          value={config.question || ""}
          onChange={(e) => updateConfig({ question: e.target.value })}
          placeholder="Enter the decision question..."
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Options</Label>
          <Button variant="outline" size="sm" onClick={addOption}>
            <Plus className="mr-1 size-3" />
            Add
          </Button>
        </div>
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              className="flex-1"
              value={opt.label}
              onChange={(e) => updateOption(idx, "label", e.target.value)}
              placeholder="Label"
            />
            <Input
              className="w-24"
              value={opt.value}
              onChange={(e) => updateOption(idx, "value", e.target.value)}
              placeholder="Value"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeOption(idx)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label>Timeout (ms, optional)</Label>
        <Input
          type="number"
          value={config.timeout || ""}
          onChange={(e) =>
            updateConfig({
              timeout: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="e.g. 86400000 (24h)"
        />
      </div>
    </>
  )
}

function FeedbackFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  const selectedCategories = (config.categories || []) as string[]

  const toggleCategory = (cat: string) => {
    const updated = selectedCategories.includes(cat)
      ? selectedCategories.filter((c) => c !== cat)
      : [...selectedCategories, cat]
    updateConfig({ categories: updated })
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Feedback Type</Label>
        <Select
          value={config.feedbackType || "match_reaction"}
          onValueChange={(v) => updateConfig({ feedbackType: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="match_reaction">Match Reaction</SelectItem>
            <SelectItem value="date_feedback">Date Feedback</SelectItem>
            <SelectItem value="recalibration">Recalibration</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Categories</Label>
        <div className="space-y-2">
          {FEEDBACK_CATEGORIES.map((cat) => (
            <label
              key={cat}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={selectedCategories.includes(cat)}
                onCheckedChange={() => toggleCategory(cat)}
              />
              <span className="text-xs">
                {cat.replace(/_/g, " ")}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={config.allowFreeText ?? true}
          onCheckedChange={(checked) =>
            updateConfig({ allowFreeText: checked })
          }
        />
        <Label className="text-xs">Allow free text</Label>
      </div>
    </>
  )
}

function ActionFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  const params = (config.params || {}) as Record<string, string>
  const paramEntries = Object.entries(params)

  const addParam = () => {
    updateConfig({
      params: { ...params, [`param_${paramEntries.length + 1}`]: "" },
    })
  }

  const removeParam = (key: string) => {
    const updated = { ...params }
    delete updated[key]
    updateConfig({ params: updated })
  }

  const updateParam = (oldKey: string, newKey: string, value: string) => {
    const entries = Object.entries(params).map(([k, v]) =>
      k === oldKey ? [newKey, value] : [k, v]
    )
    updateConfig({ params: Object.fromEntries(entries) })
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Action Type</Label>
        <Select
          value={config.actionType || "notify_admin"}
          onValueChange={(v) => updateConfig({ actionType: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Parameters</Label>
          <Button variant="outline" size="sm" onClick={addParam}>
            <Plus className="mr-1 size-3" />
            Add
          </Button>
        </div>
        {paramEntries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <Input
              className="w-24"
              value={key}
              onChange={(e) => updateParam(key, e.target.value, value as string)}
              placeholder="Key"
            />
            {key === "final_status" ? (
              <Select
                value={value as string}
                onValueChange={(v) => updateParam(key, key, v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="flex-1"
                value={value as string}
                onChange={(e) => updateParam(key, key, e.target.value)}
                placeholder="Value"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeParam(key)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}

function DelayFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Duration</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            className="w-20"
            value={config.duration || ""}
            onChange={(e) =>
              updateConfig({
                duration: e.target.value ? Number(e.target.value) : 0,
              })
            }
            placeholder="0"
          />
          <Select
            value={config.unit || "hours"}
            onValueChange={(v) => updateConfig({ unit: v })}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Reminder Template (optional)</Label>
        <Textarea
          rows={3}
          value={config.reminderTemplate || ""}
          onChange={(e) =>
            updateConfig({ reminderTemplate: e.target.value })
          }
          placeholder="Reminder message text..."
        />
      </div>
    </>
  )
}

function ConditionFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Expression</Label>
        <Textarea
          rows={3}
          value={config.expression || ""}
          onChange={(e) => updateConfig({ expression: e.target.value })}
          placeholder='e.g. context.memberDecision === "interested"'
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label>True Edge ID</Label>
        <Input
          value={config.trueEdgeId || ""}
          onChange={(e) => updateConfig({ trueEdgeId: e.target.value })}
          placeholder="Edge ID for true branch"
        />
      </div>
      <div className="space-y-2">
        <Label>False Edge ID</Label>
        <Input
          value={config.falseEdgeId || ""}
          onChange={(e) => updateConfig({ falseEdgeId: e.target.value })}
          placeholder="Edge ID for false branch"
        />
      </div>
    </>
  )
}

function EndFields({
  config,
  updateConfig,
}: {
  config: Record<string, any>
  updateConfig: (u: Record<string, any>) => void
}) {
  return (
    <div className="space-y-2">
      <Label>End Type</Label>
      <Select
        value={config.endType || "completed"}
        onValueChange={(v) => updateConfig({ endType: v })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="expired">Expired</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
          <SelectItem value="error">Error</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
