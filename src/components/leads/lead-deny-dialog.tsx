"use client"

import { useState } from "react"
import { XCircle, Loader2 } from "lucide-react"
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

export function LeadDenyDialog({
  leadId,
  prospectName,
}: {
  leadId: Id<"membershipLeads">
  prospectName: string
}) {
  const [notes, setNotes] = useState("")
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const { mutateWithAuth } = useAuthMutation(api.membershipLeads.mutations.deny)

  const handleDeny = async () => {
    setIsPending(true)
    try {
      await mutateWithAuth({
        leadId,
        adminNotes: notes || undefined,
      })
      toast.success(`${prospectName} denied — decline message will be sent`)
      setNotes("")
      setOpen(false)
    } catch (error: any) {
      toast.error(error?.message || "Failed to deny lead")
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
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <XCircle className="h-3 w-3" />
          Deny
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deny {prospectName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a graceful decline WhatsApp message and sync a note to
            their SMA profile. They&apos;ll stay on the free matching tier.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Optional notes (reason for denial)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-[80px]"
          disabled={isPending}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleDeny}
            disabled={isPending}
            variant="destructive"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Denying...
              </>
            ) : (
              "Deny"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
