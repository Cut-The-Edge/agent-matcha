"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Send, Loader2 } from "lucide-react"

interface SendFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberName: string
  isSending: boolean
  onConfirm: () => void
}

export function SendFormDialog({
  open,
  onOpenChange,
  memberName,
  isSending,
  onConfirm,
}: SendFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Data Request</DialogTitle>
          <DialogDescription>
            Send a profile completion form to <strong>{memberName}</strong> via WhatsApp?
            They&apos;ll receive a link to fill in their missing information.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSending}>
            {isSending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Send className="mr-1 size-4" />
            )}
            Send Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
