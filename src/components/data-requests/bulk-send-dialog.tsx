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

interface BulkSendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  isSending: boolean
  onConfirm: () => void
}

export function BulkSendDialog({
  open,
  onOpenChange,
  count,
  isSending,
  onConfirm,
}: BulkSendDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to Selected Members</DialogTitle>
          <DialogDescription>
            Send profile completion forms to <strong>{count}</strong> selected member
            {count !== 1 ? "s" : ""} via WhatsApp? Members without a phone number or with
            a pending request will be skipped.
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
            Send to {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
