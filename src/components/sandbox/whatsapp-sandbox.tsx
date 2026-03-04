"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import {
  FlaskConical,
  Play,
  Eye,
  Pencil,
  Check,
  X,
  Loader2,
  RotateCcw,
} from "lucide-react"

export function WhatsAppSandboxContent() {
  const router = useRouter()

  // Data queries
  const members = useAuthQuery(api.members.queries.list, { limit: 100 })
  const flowDefs = useQuery(api.engine.queries.listFlowDefinitions, {})
  const activeInstances = useQuery(api.engine.queries.listFlowInstances, {
    status: "active",
  })

  // Mutations
  const startSandbox = useMutation(api.engine.sandbox.startSandboxFlow)
  const resetAndSeed = useMutation(api.engine.mutations.resetAndSeedFlow)
  const { mutateWithAuth: updateMember } = useAuthMutation(
    api.members.mutations.update
  )
  const resetMember = useMutation(api.engine.sandbox.resetMember)
  const [isSeeding, setIsSeeding] = useState(false)
  const [resettingMemberId, setResettingMemberId] = useState<string | null>(null)

  // Form state
  const [selectedFlowId, setSelectedFlowId] = useState<string>("")
  const [memberAId, setMemberAId] = useState<string>("")
  const [memberBId, setMemberBId] = useState<string>("")
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline edit state for whatsappId / profileLink
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<"whatsappId" | "profileLink">("whatsappId")
  const [editValue, setEditValue] = useState("")

  const activeFlows = flowDefs?.filter((f: any) => f.isActive) ?? []

  async function handleStartFlow() {
    if (!selectedFlowId || !memberAId) {
      setError("Please select a flow and at least Member A")
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      const result = await startSandbox({
        flowDefinitionId: selectedFlowId as Id<"flowDefinitions">,
        memberAId: memberAId as Id<"members">,
        memberBId: memberBId
          ? (memberBId as Id<"members">)
          : undefined,
      })

      // Navigate to monitor for the first instance
      if (result.instanceIds.length > 0) {
        router.push(
          `/dashboard/flows/monitor/${result.instanceIds[0]}`
        )
      }
    } catch (err: any) {
      setError(err.message || "Failed to start flow")
    } finally {
      setIsStarting(false)
    }
  }

  async function handleSaveField(memberId: string) {
    try {
      await updateMember({
        memberId: memberId as Id<"members">,
        ...(editingField === "whatsappId"
          ? { whatsappId: editValue }
          : { profileLink: editValue }),
      })
      setEditingMemberId(null)
    } catch (err: any) {
      console.error(`Failed to update ${editingField}:`, err)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 px-6 pb-2">
        <button
          type="button"
          onClick={async () => {
            setIsSeeding(true)
            try {
              await resetAndSeed({})
              setError(null)
            } catch (err: any) {
              setError(err.message)
            } finally {
              setIsSeeding(false)
            }
          }}
          disabled={isSeeding}
          className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
        >
          {isSeeding ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <FlaskConical className="size-3" />
          )}
          Reset &amp; Seed Default Flow
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Config & Trigger */}
        <div className="w-1/2 overflow-y-auto border-r border-border p-6">
          {/* Member table */}
          <h3 className="text-sm font-semibold">Members</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Click the pencil icon to set WhatsApp ID or Profile Link
          </p>

          <div className="mb-6 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">WhatsApp ID</th>
                  <th className="px-3 py-2 text-left font-medium">Profile Link</th>
                  <th className="px-3 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {members?.map((m: any) => (
                  <tr key={m._id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">
                      {m.firstName} {m.lastName || ""}
                    </td>
                    {/* WhatsApp ID */}
                    <td className="px-3 py-2">
                      {editingMemberId === m._id && editingField === "whatsappId" ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="whatsapp:+1234..."
                            className="w-full rounded border px-2 py-1 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveField(m._id)
                              if (e.key === "Escape") setEditingMemberId(null)
                            }}
                          />
                          <button type="button" onClick={() => handleSaveField(m._id)} className="rounded p-1 text-green-600 hover:bg-green-50">
                            <Check className="size-3" />
                          </button>
                          <button type="button" onClick={() => setEditingMemberId(null)} className="rounded p-1 text-red-600 hover:bg-red-50">
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="truncate text-muted-foreground">{m.whatsappId || "—"}</span>
                          <button
                            type="button"
                            onClick={() => { setEditingMemberId(m._id); setEditingField("whatsappId"); setEditValue(m.whatsappId || "") }}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                          >
                            <Pencil className="size-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    {/* Profile Link */}
                    <td className="px-3 py-2">
                      {editingMemberId === m._id && editingField === "profileLink" ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="https://..."
                            className="w-full rounded border px-2 py-1 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveField(m._id)
                              if (e.key === "Escape") setEditingMemberId(null)
                            }}
                          />
                          <button type="button" onClick={() => handleSaveField(m._id)} className="rounded p-1 text-green-600 hover:bg-green-50">
                            <Check className="size-3" />
                          </button>
                          <button type="button" onClick={() => setEditingMemberId(null)} className="rounded p-1 text-red-600 hover:bg-red-50">
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="max-w-[140px] truncate text-muted-foreground">{m.profileLink || "—"}</span>
                          <button
                            type="button"
                            onClick={() => { setEditingMemberId(m._id); setEditingField("profileLink"); setEditValue(m.profileLink || "") }}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                          >
                            <Pencil className="size-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    {/* Reset button */}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        title="Reset member — clears all matches, flows, payments, feedback, and messages"
                        disabled={resettingMemberId === m._id}
                        onClick={async () => {
                          if (!confirm(`Reset ${m.firstName} ${m.lastName || ""}? This deletes all their matches, flows, payments, feedback, and messages.`)) return
                          setResettingMemberId(m._id)
                          try {
                            await resetMember({ memberId: m._id as Id<"members"> })
                          } catch (err: any) {
                            console.error("Reset failed:", err)
                          } finally {
                            setResettingMemberId(null)
                          }
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        {resettingMemberId === m._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                )) ?? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                      Loading members...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Flow + member selectors */}
          <h3 className="mb-2 text-sm font-semibold">Start a Test Flow</h3>

          <div className="space-y-3">
            {/* Flow definition */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Flow Definition
              </label>
              <select
                value={selectedFlowId}
                onChange={(e) => setSelectedFlowId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Select a flow...</option>
                {activeFlows.map((f: any) => (
                  <option key={f._id} value={f._id}>
                    {f.name} ({f.type}) — v{f.version}
                  </option>
                ))}
                {/* Also show inactive for testing */}
                {flowDefs
                  ?.filter((f: any) => !f.isActive)
                  .map((f: any) => (
                    <option key={f._id} value={f._id}>
                      {f.name} ({f.type}) — v{f.version} [inactive]
                    </option>
                  ))}
              </select>
            </div>

            {/* Member A */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Member A (required)
              </label>
              <select
                value={memberAId}
                onChange={(e) => setMemberAId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Select member A...</option>
                {members?.map((m: any) => (
                  <option key={m._id} value={m._id}>
                    {m.firstName} {m.lastName || ""}{" "}
                    {m.whatsappId ? `(${m.whatsappId})` : "(no WhatsApp)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Member B */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Member B (optional)
              </label>
              <select
                value={memberBId}
                onChange={(e) => setMemberBId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">None (single-member flow)</option>
                {members
                  ?.filter((m: any) => m._id !== memberAId)
                  .map((m: any) => (
                    <option key={m._id} value={m._id}>
                      {m.firstName} {m.lastName || ""}{" "}
                      {m.whatsappId ? `(${m.whatsappId})` : "(no WhatsApp)"}
                    </option>
                  ))}
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <button
              type="button"
              onClick={handleStartFlow}
              disabled={isStarting || !selectedFlowId || !memberAId}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isStarting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Start Test Flow
            </button>
          </div>
        </div>

        {/* Right: Active Instances */}
        <div className="w-1/2 overflow-y-auto p-6">
          <h3 className="mb-3 text-sm font-semibold">Active Instances</h3>

          {!activeInstances ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : activeInstances.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active flow instances. Start a test flow to see them here.
            </p>
          ) : (
            <div className="space-y-2">
              {activeInstances.map((inst: any) => (
                <InstanceCard
                  key={inst._id}
                  instance={inst}
                  flowDefs={flowDefs}
                  members={members}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function InstanceCard({
  instance,
  flowDefs,
  members,
}: {
  instance: any
  flowDefs: any[] | undefined
  members: any[] | undefined
}) {
  const router = useRouter()
  const flowDef = flowDefs?.find((f) => f._id === instance.flowDefinitionId)
  const member = members?.find((m) => m._id === instance.memberId)

  const elapsed = Math.floor((Date.now() - instance.startedAt) / 1000)
  const elapsedStr =
    elapsed < 60
      ? `${elapsed}s`
      : elapsed < 3600
        ? `${Math.floor(elapsed / 60)}m`
        : `${Math.floor(elapsed / 3600)}h`

  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {flowDef?.name || "Unknown Flow"}
          </span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {instance.status}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {member && (
            <span>
              {member.firstName} {member.lastName || ""}
            </span>
          )}
          <span>·</span>
          <span>Node: {instance.currentNodeId}</span>
          <span>·</span>
          <span>{elapsedStr} ago</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          router.push(`/dashboard/flows/monitor/${instance._id}`)
        }
        className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Eye className="size-3" />
        Monitor
      </button>
    </div>
  )
}
