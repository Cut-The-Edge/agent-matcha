"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface TranscriptSegment {
  _id: string
  speaker: "caller" | "agent"
  text: string
  timestamp: number
}

interface AISummary {
  summary?: string
  extractedFields?: Record<string, string | number>
  profileCompleteness?: number
  recommendedNextSteps?: string[]
  sentiment?: string
  flags?: string[]
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[]
  aiSummary?: AISummary | null
  extractedData?: Record<string, unknown> | null
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function TranscriptViewer({
  segments,
  aiSummary,
  extractedData,
}: TranscriptViewerProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Transcript column */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              {segments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No transcript available.
                </p>
              ) : (
                <div className="space-y-3">
                  {segments.map((seg) => (
                    <div key={seg._id} className="flex gap-3">
                      <div className="flex flex-col items-end gap-1 pt-0.5">
                        <Badge
                          variant={
                            seg.speaker === "agent" ? "default" : "outline"
                          }
                          className="text-xs whitespace-nowrap"
                        >
                          {seg.speaker === "agent" ? "Matcha" : "Caller"}
                        </Badge>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatTime(seg.timestamp)}
                        </span>
                      </div>
                      <p className="flex-1 text-sm leading-relaxed">
                        {seg.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Summary sidebar */}
      <div className="space-y-4">
        {aiSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiSummary.summary && (
                <p className="text-sm">{aiSummary.summary}</p>
              )}

              {aiSummary.sentiment && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Sentiment:
                  </span>
                  <Badge
                    variant={
                      aiSummary.sentiment === "positive"
                        ? "default"
                        : aiSummary.sentiment === "negative"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {aiSummary.sentiment}
                  </Badge>
                </div>
              )}

              {aiSummary.profileCompleteness !== undefined && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Profile completeness:
                  </span>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${aiSummary.profileCompleteness}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {aiSummary.profileCompleteness}%
                  </span>
                </div>
              )}

              {aiSummary.recommendedNextSteps &&
                aiSummary.recommendedNextSteps.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Next Steps
                    </span>
                    <ul className="mt-1 space-y-1">
                      {aiSummary.recommendedNextSteps.map((step, i) => (
                        <li
                          key={i}
                          className="text-sm text-muted-foreground"
                        >
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {extractedData && Object.keys(extractedData).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extracted Data</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                {Object.entries(extractedData).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </dt>
                    <dd className="text-sm">{String(value)}</dd>
                    <Separator className="mt-2" />
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
