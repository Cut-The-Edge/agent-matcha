"use client"

import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  Heart,
  Meh,
  X,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Info,
} from "lucide-react"

const RATING_CONFIG = {
  great_chemistry: {
    label: "Great Chemistry",
    icon: Heart,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-100 text-green-800",
  },
  okay: {
    label: "It Was Okay",
    icon: Meh,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-800",
  },
  not_a_match: {
    label: "Not a Match",
    icon: X,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-800",
  },
} as const

const COMPATIBILITY_TOOLTIP = `Compatibility Score (0-10)

Calculated from both members' post-date feedback using AI analysis across 5 dimensions:

- Lifestyle: social habits, interests, financial outlook
- Energy: social energy, introvert/extrovert match
- Values: family, religion, life goals alignment
- Attraction: physical chemistry reported by both sides
- Chemistry: overall conversational and emotional connection

Scoring rules:
- Both say "Great chemistry" = base 8-9
- Mixed signals = 4-7
- Both say "Not a match" = 2-4
- Mutual positive signals boost scores
- One-sided negatives reduce moderately

The score improves future matching by revealing real-world compatibility patterns beyond profile data.`

function CssScoreRing({ score }: { score: number }) {
  const pct = (score / 10) * 100
  const color =
    score >= 7 ? "text-green-500" : score >= 5 ? "text-amber-500" : "text-red-500"
  const strokeColor =
    score >= 7 ? "stroke-green-500" : score >= 5 ? "stroke-amber-500" : "stroke-red-500"

  return (
    <div className="relative size-16 shrink-0">
      <svg className="size-16 -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r="15.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted/30"
        />
        <circle
          cx="18" cy="18" r="15.5"
          fill="none"
          strokeWidth="2.5"
          strokeDasharray={`${pct} ${100 - pct}`}
          strokeLinecap="round"
          className={strokeColor}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${color}`}>
        {score.toFixed(1)}
      </span>
    </div>
  )
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  const pct = (score / 10) * 100
  const color =
    score >= 7 ? "bg-green-500" : score >= 5 ? "bg-amber-500" : "bg-red-500"

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[11px] text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted/40">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-5 text-[11px] font-medium text-right">{score}</span>
    </div>
  )
}

function FeedbackCard({ fb }: { fb: any }) {
  const config = RATING_CONFIG[fb.overallRating as keyof typeof RATING_CONFIG] || RATING_CONFIG.okay
  const Icon = config.icon
  const hasCSS = fb.cssScore !== null

  return (
    <Card className={`${config.border} border`}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Left: CSS ring or rating icon */}
          <div className="flex flex-col items-center gap-1">
            {hasCSS ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="cursor-help">
                    <CssScoreRing score={fb.cssScore} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs whitespace-pre-line text-left">
                  {COMPATIBILITY_TOOLTIP}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className={`size-16 rounded-full ${config.bg} flex items-center justify-center`}>
                <Icon className={`size-7 ${config.color}`} />
              </div>
            )}
            {hasCSS && (
              <span className="text-[9px] text-muted-foreground font-medium">Score</span>
            )}
          </div>

          {/* Right: details */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{fb.memberName}</span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{fb.partnerName}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(fb.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <Badge className={`text-[10px] ${config.badge} border-0`}>
                {config.label}
              </Badge>
            </div>

            {/* Would see again */}
            {fb.wouldSeeAgain !== undefined && fb.wouldSeeAgain !== null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {fb.wouldSeeAgain ? (
                  <><TrendingUp className="size-3 text-green-500" /> Would see again</>
                ) : (
                  <><TrendingDown className="size-3 text-red-500" /> Would not see again</>
                )}
              </div>
            )}

            {/* Positive signals */}
            {fb.positiveSignals?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {fb.positiveSignals.map((s: string) => (
                  <Badge key={s} variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                    {s.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            )}

            {/* Negative categories */}
            {fb.negativeCategories?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {fb.negativeCategories.map((c: string) => (
                  <Badge key={c} variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                    {c.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            )}

            {/* Free text */}
            {fb.freeText && (
              <p className="text-xs text-muted-foreground italic">
                &ldquo;{fb.freeText}&rdquo;
              </p>
            )}

            {/* CSS dimensions */}
            {hasCSS && fb.cssDimensions && (
              <div className="space-y-1 pt-1">
                <DimensionBar label="Lifestyle" score={fb.cssDimensions.lifestyle} />
                <DimensionBar label="Energy" score={fb.cssDimensions.energy} />
                <DimensionBar label="Values" score={fb.cssDimensions.values} />
                <DimensionBar label="Attraction" score={fb.cssDimensions.attraction} />
                <DimensionBar label="Chemistry" score={fb.cssDimensions.chemistry} />
              </div>
            )}

            {/* CSS summary */}
            {fb.cssSummary && (
              <div className="flex items-start gap-1.5 pt-1">
                <Sparkles className="size-3 text-purple-500 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">{fb.cssSummary}</p>
              </div>
            )}

            {/* CSS strengths / weaknesses */}
            {(fb.cssStrengths?.length > 0 || fb.cssWeaknesses?.length > 0) && (
              <div className="flex gap-4 pt-1 text-[10px]">
                {fb.cssStrengths?.length > 0 && (
                  <div>
                    <span className="font-medium text-green-700">Strengths: </span>
                    <span className="text-muted-foreground">{fb.cssStrengths.join(", ")}</span>
                  </div>
                )}
                {fb.cssWeaknesses?.length > 0 && (
                  <div>
                    <span className="font-medium text-red-700">Weaknesses: </span>
                    <span className="text-muted-foreground">{fb.cssWeaknesses.join(", ")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SkeletonCards() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <Skeleton className="size-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function DateFeedbackPage() {
  const feedback = useQuery(api.dateFeedback.queries.listAll, {})

  // Aggregate stats
  const stats = feedback
    ? {
        total: feedback.length,
        great: feedback.filter((f: any) => f.overallRating === "great_chemistry").length,
        okay: feedback.filter((f: any) => f.overallRating === "okay").length,
        notMatch: feedback.filter((f: any) => f.overallRating === "not_a_match").length,
        avgCss:
          feedback.filter((f: any) => f.cssScore !== null).length > 0
            ? (
                feedback
                  .filter((f: any) => f.cssScore !== null)
                  .reduce((sum: number, f: any) => sum + f.cssScore!, 0) /
                feedback.filter((f: any) => f.cssScore !== null).length
              ).toFixed(1)
            : null,
      }
    : null

  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Date Feedback</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Post-date feedback and Compatibility Signal Scores from both sides.
        </p>
      </div>

      {/* Stats cards */}
      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "50ms" }}>
        {stats ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Total Feedback
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <span className="text-2xl font-bold">{stats.total}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[10px] uppercase tracking-wider text-green-600 font-medium">
                  Great Chemistry
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <span className="text-2xl font-bold text-green-600">{stats.great}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[10px] uppercase tracking-wider text-amber-600 font-medium">
                  Okay
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <span className="text-2xl font-bold text-amber-600">{stats.okay}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[10px] uppercase tracking-wider text-red-600 font-medium">
                  Not a Match
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <span className="text-2xl font-bold text-red-600">{stats.notMatch}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[10px] uppercase tracking-wider text-purple-600 font-medium flex items-center gap-1">
                  Avg Compatibility
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line text-left">
                      {COMPATIBILITY_TOOLTIP}
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <span className="text-2xl font-bold text-purple-600">
                  {stats.avgCss ?? "--"}
                </span>
                <span className="text-xs text-muted-foreground"> / 10</span>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-7 w-12" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Feedback list */}
      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        {feedback === undefined ? (
          <SkeletonCards />
        ) : feedback.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Heart className="size-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-semibold">No Feedback Yet</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                Date feedback will appear here when members respond to the post-date flow.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {feedback.map((fb: any) => (
              <FeedbackCard key={fb._id} fb={fb} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
