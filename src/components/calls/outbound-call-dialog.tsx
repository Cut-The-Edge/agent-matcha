"use client"

import { useState, useEffect, useRef } from "react"
import { PhoneOutgoing, Search, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import { toast } from "sonner"

export function OutboundCallDialog() {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState("")
  const [context, setContext] = useState("full_intake")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)

  // Member search
  const [memberSearch, setMemberSearch] = useState("")
  const [showResults, setShowResults] = useState(false)
  const [selectedMember, setSelectedMember] = useState<{
    name: string
    phone: string
  } | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const members = useAuthQuery(
    api.members.queries.list,
    memberSearch.length >= 2 ? { search: memberSearch, limit: 8 } : "skip"
  )

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function selectMember(member: { firstName?: string; lastName?: string; phone?: string }) {
    const name = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim()
    setSelectedMember({ name, phone: member.phone ?? "" })
    setPhone(member.phone ?? "")
    setMemberSearch("")
    setShowResults(false)
  }

  function clearMember() {
    setSelectedMember(null)
    setPhone("")
    setMemberSearch("")
  }

  async function handleCall() {
    if (!phone.trim()) {
      toast.error("Please enter a phone number or select a member")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/outbound-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          context,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to place call")
      toast.success("Outbound call initiated — dialing " + data.phone)
      setOpen(false)
      setPhone("")
      setNotes("")
      setSelectedMember(null)
      setMemberSearch("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to initiate call")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v)
      if (!v) {
        setSelectedMember(null)
        setMemberSearch("")
        setShowResults(false)
      }
    }}>
      <DialogTrigger asChild>
        <Button>
          <PhoneOutgoing className="mr-2 size-4" />
          Call Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Outbound Call</DialogTitle>
          <DialogDescription>
            Place an outbound call to a member using the AI intake agent.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Member Search */}
          <div className="grid gap-2" ref={searchRef}>
            <Label>Search Member</Label>
            {selectedMember ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <User className="size-4 text-muted-foreground" />
                <span className="flex-1">{selectedMember.name}</span>
                <span className="text-muted-foreground">{selectedMember.phone}</span>
                <button onClick={clearMember} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, or email..."
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value)
                    setShowResults(true)
                  }}
                  onFocus={() => memberSearch.length >= 2 && setShowResults(true)}
                  className="pl-9"
                />
                {showResults && members && members.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                    {members.map((m) => (
                      <button
                        key={m._id}
                        className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent text-left"
                        onClick={() => selectMember(m)}
                      >
                        <User className="size-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">
                          {m.firstName} {m.lastName ?? ""}
                        </span>
                        <span className="text-muted-foreground text-xs truncate">
                          {m.phone ?? "no phone"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {showResults && memberSearch.length >= 2 && members && members.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md">
                    No members found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Phone Number */}
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                if (selectedMember) setSelectedMember(null)
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="context">Call Context</Label>
            <Select value={context} onValueChange={setContext}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_intake">Full Intake</SelectItem>
                <SelectItem value="profile_update">Profile Update</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Agent Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any context for the AI agent..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCall} disabled={loading}>
            {loading ? "Dialing..." : "Place Call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
