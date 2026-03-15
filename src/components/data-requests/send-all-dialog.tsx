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

interface SendAllDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  missingCount: number
  isSending: boolean
  onConfirm: () => void
}

export function SendAllDialog({
  open,
  onOpenChange,
  missingCount,
  isSending,
  onConfirm,
}: SendAllDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to All Members with Missing Data</DialogTitle>
          <DialogDescription>
            This will send profile completion forms to all <strong>{missingCount}</strong> member
            {missingCount !== 1 ? "s" : ""} who have missing data and no pending request.
            Members without a phone number will be skipped.
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
            Send to All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
