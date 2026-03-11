"use client"

import { useState } from "react"
import { CheckCircle, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toast } from "sonner"

export function LeadApproveDialog({
  leadId,
  prospectName,
}: {
  leadId: Id<"membershipLeads">
  prospectName: string
}) {
  const [notes, setNotes] = useState("")
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const { mutateWithAuth } = useAuthMutation(api.membershipLeads.mutations.approve)

  const handleApprove = async () => {
    setIsPending(true)
    try {
      await mutateWithAuth({
        leadId,
        adminNotes: notes || undefined,
      })
      toast.success(`${prospectName} approved — welcome message will be sent`)
      setNotes("")
      setOpen(false)
    } catch (error: any) {
      toast.error(error?.message || "Failed to approve lead")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) setNotes("")
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="default" className="h-7 gap-1 text-xs">
          <CheckCircle className="h-3 w-3" />
          Approve
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve {prospectName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a welcome WhatsApp message, update their SMA
            membership type, and sync a note to their SMA profile.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Optional notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-[80px]"
          disabled={isPending}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button onClick={handleApprove} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Approving...
              </>
            ) : (
              "Approve"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
