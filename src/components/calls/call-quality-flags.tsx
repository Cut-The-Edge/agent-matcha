"use client"

import { Badge } from "@/components/ui/badge"

const FLAG_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  short_call: { label: "Short", variant: "secondary" },
  transferred: { label: "Transferred", variant: "outline" },
  sma_sync_failed: { label: "Sync Failed", variant: "destructive" },
  guardrail_triggered: { label: "Guardrail", variant: "destructive" },
  pricing_question: { label: "Pricing Q", variant: "secondary" },
  hostile: { label: "Hostile", variant: "destructive" },
  confused: { label: "Confused", variant: "secondary" },
}

interface CallQualityFlagsProps {
  flags: string[] | undefined
}

export function CallQualityFlags({ flags }: CallQualityFlagsProps) {
  if (!flags || flags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => {
        const config = FLAG_CONFIG[flag] ?? {
          label: flag,
          variant: "outline" as const,
        }
        return (
          <Badge key={flag} variant={config.variant} className="text-xs">
            {config.label}
          </Badge>
        )
      })}
    </div>
  )
}
