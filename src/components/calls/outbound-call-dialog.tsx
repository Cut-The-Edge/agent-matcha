"use client"

import { useState } from "react"
import { PhoneOutgoing } from "lucide-react"
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
import { useAuthAction } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import { toast } from "sonner"

export function OutboundCallDialog() {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState("")
  const [context, setContext] = useState("full_intake")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)

  const { actionWithAuth: triggerCall } = useAuthAction(
    api.voice.actions.triggerOutboundCall
  )

  async function handleCall() {
    if (!phone.trim()) {
      toast.error("Please enter a phone number")
      return
    }

    setLoading(true)
    try {
      const contextStr = notes
        ? `${context}: ${notes}`
        : context
      await triggerCall({ phone: phone.trim(), context: contextStr })
      toast.success("Outbound call initiated")
      setOpen(false)
      setPhone("")
      setNotes("")
    } catch (err) {
      toast.error("Failed to initiate call")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
