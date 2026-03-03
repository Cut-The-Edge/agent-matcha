# Agent Matcha — Project Scaffolding

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js (App Router) + React + TypeScript | |
| Backend | Convex (DB + functions + real-time) | |
| AI Agent | `@convex-dev/agent` | WhatsApp bot brain |
| Workflows | `@convex-dev/workflow` | Durable match flows |
| WhatsApp | `@convex-dev/twilio` + Twilio Conversations API | Groups + buttons |
| Payments | `@convex-dev/stripe` | Personal Outreach upsell |
| CRM | SmartMatchApp API | Custom integration |
| Auth | Custom bcrypt + sessions (from agent-analog) | No Clerk |
| UI | shadcn/ui + Tailwind v4 | From agent-analog |
| Charts | Recharts | Dashboard metrics |
| Tables | TanStack Table | Data tables |
| Hosting | Vercel (frontend) + Convex Cloud (backend) | |

## Convex Components

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import twilio from "@convex-dev/twilio/convex.config";
import stripe from "@convex-dev/stripe/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import crons from "@convex-dev/crons/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";

const app = defineApp();
app.use(agent);
app.use(workflow);
app.use(twilio);
app.use(stripe);
app.use(rateLimiter);
app.use(actionRetrier);
app.use(crons);
app.use(aggregate);
app.use(shardedCounter);

export default app;
```

---

## Project Structure

```
agent-matcha/
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── layout.tsx                    # Root layout + providers
│   │   ├── page.tsx                      # Landing/redirect
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx              # Login page
│   │   └── dashboard/
│   │       ├── layout.tsx                # Dashboard shell (sidebar + header)
│   │       ├── page.tsx                  # Overview (stats, recent activity)
│   │       ├── matches/
│   │       │   ├── page.tsx              # All matches list
│   │       │   └── [matchId]/
│   │       │       └── page.tsx          # Single match detail + conversation
│   │       ├── members/
│   │       │   ├── page.tsx              # Members list (synced from SMA)
│   │       │   └── [memberId]/
│   │       │       └── page.tsx          # Member profile + match history
│   │       ├── conversations/
│   │       │   └── page.tsx              # WhatsApp conversations view
│   │       ├── analytics/
│   │       │   └── page.tsx              # Metrics (response rates, feedback)
│   │       ├── users/
│   │       │   └── page.tsx              # Admin user management
│   │       └── settings/
│   │           └── page.tsx              # System settings, API config
│   │
│   ├── components/
│   │   ├── ui/                           # shadcn/ui (copied from agent-analog)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── table.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── ... (38 components)
│   │   │   └── data-table.tsx
│   │   ├── providers/
│   │   │   ├── auth-provider.tsx          # Session management (from analog)
│   │   │   ├── convex-provider.tsx        # Convex client (from analog)
│   │   │   └── theme-provider.tsx         # Dark/light mode
│   │   ├── layout/
│   │   │   ├── app-sidebar.tsx            # Main nav sidebar
│   │   │   ├── site-header.tsx            # Top header
│   │   │   └── nav-user.tsx              # User dropdown
│   │   ├── dashboard/
│   │   │   ├── section-cards.tsx          # Overview stat cards
│   │   │   ├── recent-activity.tsx        # Activity feed
│   │   │   └── charts.tsx                # Dashboard charts
│   │   ├── matches/
│   │   │   ├── match-list.tsx             # Match table with filters
│   │   │   ├── match-detail.tsx           # Single match view
│   │   │   ├── match-timeline.tsx         # Match flow timeline
│   │   │   ├── feedback-panel.tsx         # Feedback display
│   │   │   └── trigger-match-dialog.tsx   # "Start match flow" button
│   │   ├── members/
│   │   │   ├── member-list.tsx            # Members table
│   │   │   ├── member-profile.tsx         # Profile card
│   │   │   └── member-sync-status.tsx     # SMA sync indicator
│   │   ├── conversations/
│   │   │   ├── conversation-list.tsx      # Thread list
│   │   │   ├── message-thread.tsx         # Message bubbles
│   │   │   └── whatsapp-preview.tsx       # WhatsApp-style preview
│   │   └── login-form.tsx                 # Login/register (from analog)
│   │
│   ├── hooks/
│   │   ├── use-auth-query.ts              # (from analog)
│   │   ├── use-auth-mutation.ts           # (from analog)
│   │   ├── use-auth-action.ts             # (from analog)
│   │   ├── use-current-user.ts            # (from analog)
│   │   └── use-require-auth.ts            # (from analog)
│   │
│   ├── lib/
│   │   ├── utils.ts                       # cn() helper, formatters
│   │   └── constants.ts                   # App-wide constants
│   │
│   └── middleware.ts                       # Auth route protection (from analog)
│
├── convex/                                # === CONVEX BACKEND ===
│   ├── convex.config.ts                   # Component registration
│   ├── schema.ts                          # Database schema
│   ├── http.ts                            # HTTP router (webhooks)
│   │
│   ├── auth/                              # Authentication (from analog)
│   │   ├── auth.ts                        # Login, register, sessions
│   │   ├── authz.ts                       # RBAC helpers
│   │   └── admins.ts                      # Admin CRUD
│   │
│   ├── agents/                            # AI Agent definitions
│   │   ├── matchFeedback.ts               # WhatsApp feedback bot agent
│   │   ├── introFacilitator.ts            # Group chat intro agent
│   │   └── tools.ts                       # Shared agent tools
│   │
│   ├── workflows/                         # Durable workflows
│   │   ├── matchFlow.ts                   # Full match feedback flow
│   │   ├── personalOutreach.ts            # $250 upsell flow
│   │   ├── recalibration.ts              # 3-rejection recalibration
│   │   └── followUp.ts                    # 4-day post-match check-in
│   │
│   ├── integrations/                      # External services
│   │   ├── twilio/
│   │   │   ├── config.ts                  # Twilio client setup
│   │   │   ├── whatsapp.ts               # WhatsApp send/receive
│   │   │   ├── groups.ts                 # Conversations API (groups)
│   │   │   └── webhooks.ts              # Inbound message handler
│   │   ├── smartmatchapp/
│   │   │   ├── client.ts                 # SMA API client
│   │   │   ├── contacts.ts              # Get/update contacts
│   │   │   ├── matches.ts               # Match operations
│   │   │   └── notes.ts                 # Profile notes + match notes
│   │   └── stripe/
│   │       ├── config.ts                 # Stripe setup
│   │       ├── checkout.ts              # Create checkout sessions
│   │       └── webhooks.ts             # Payment confirmation
│   │
│   ├── matches/                           # Match domain logic
│   │   ├── queries.ts                     # List, get, filter matches
│   │   ├── mutations.ts                   # Create, update, status change
│   │   └── types.ts                       # Match-related validators
│   │
│   ├── members/                           # Member domain logic
│   │   ├── queries.ts                     # List, get, search members
│   │   ├── mutations.ts                   # Sync from SMA, update local
│   │   └── types.ts                       # Member validators
│   │
│   ├── feedback/                          # Feedback domain logic
│   │   ├── queries.ts                     # Get feedback by match/member
│   │   ├── mutations.ts                   # Save feedback responses
│   │   └── types.ts                       # Feedback category validators
│   │
│   ├── conversations/                     # Conversation tracking
│   │   ├── queries.ts                     # Thread list, messages
│   │   └── mutations.ts                   # Log messages, update status
│   │
│   ├── analytics/                         # Dashboard metrics
│   │   ├── queries.ts                     # Stats, counts, rates
│   │   └── aggregations.ts              # Pre-computed aggregates
│   │
│   ├── crons/                             # Scheduled jobs
│   │   ├── followUps.ts                   # 4-day check-in scheduler
│   │   ├── reminders.ts                   # Response reminders
│   │   └── sync.ts                        # SMA periodic sync
│   │
│   └── utils/                             # Shared utilities
│       ├── validators.ts                  # Common Convex validators
│       └── helpers.ts                     # Date, phone, formatting
│
├── public/                                # Static assets
│   └── ...
│
├── docs/                                  # Project documentation
│   ├── client-notes-dani-call.md          # Client call notes
│   ├── feedback-tree-analysis.md          # WhatsApp flow diagram
│   ├── smartmatchapp-integration.md       # SMA API research
│   └── voice-providers-research.md        # Voice AI research (M2)
│
├── package.json
├── tsconfig.json
├── next.config.ts
├── convex.json
├── components.json                        # shadcn/ui config
├── .env.local                             # Local env vars
├── SCAFFOLDING.md                         # This file
└── README.md
```

---

## What We Copy From agent-analog

### Auth System (copy & adapt)
| Source File | Destination | Changes |
|---|---|---|
| `frontend/convex/auth.ts` | `convex/auth/auth.ts` | Rename, keep logic |
| `frontend/convex/authz.ts` | `convex/auth/authz.ts` | Keep as-is |
| `frontend/convex/admins.ts` | `convex/auth/admins.ts` | Keep as-is |
| `frontend/src/components/providers/auth-provider.tsx` | `src/components/providers/auth-provider.tsx` | Keep as-is |
| `frontend/src/components/providers/convex-provider.tsx` | `src/components/providers/convex-provider.tsx` | Keep as-is |
| `frontend/src/components/login-form.tsx` | `src/components/login-form.tsx` | Rebrand to Matcha |
| `frontend/src/middleware.ts` | `src/middleware.ts` | Simplify (no gallery domains) |
| `frontend/src/hooks/use-auth-query.ts` | `src/hooks/use-auth-query.ts` | Keep as-is |
| `frontend/src/hooks/use-auth-mutation.ts` | `src/hooks/use-auth-mutation.ts` | Keep as-is |
| `frontend/src/hooks/use-auth-action.ts` | `src/hooks/use-auth-action.ts` | Keep as-is |
| `frontend/src/hooks/use-current-user.ts` | `src/hooks/use-current-user.ts` | Keep as-is |

### UI Components (copy all)
| Source | Destination |
|---|---|
| `frontend/src/components/ui/*` | `src/components/ui/*` |
| `frontend/components.json` | `components.json` |

### Layout (copy & adapt)
| Source File | Destination | Changes |
|---|---|---|
| `frontend/src/components/app-sidebar.tsx` | `src/components/layout/app-sidebar.tsx` | New nav items for Matcha |
| `frontend/src/components/site-header.tsx` | `src/components/layout/site-header.tsx` | Rebrand |
| `frontend/src/components/nav-user.tsx` | `src/components/layout/nav-user.tsx` | Keep as-is |
| `frontend/src/components/section-cards.tsx` | `src/components/dashboard/section-cards.tsx` | New metrics |
| `frontend/src/components/chart-area-interactive.tsx` | `src/components/dashboard/charts.tsx` | Keep as-is |

### Config (copy & adapt)
| Source | Destination | Changes |
|---|---|---|
| `frontend/tsconfig.json` | `tsconfig.json` | Adapt paths |
| `frontend/next.config.ts` | `next.config.ts` | Remove analog-specific |
| `frontend/tailwind/globals.css` | `src/app/globals.css` | Keep theme vars |

---

## Database Schema (convex/schema.ts)

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Auth (from analog) ──
  admins: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    role: v.union(v.literal("super_admin"), v.literal("admin")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    adminId: v.id("admins"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastAccessedAt: v.number(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_admin", ["adminId"]),

  // ── Members (synced from SmartMatchApp) ──
  members: defineTable({
    smaId: v.string(),                          // SmartMatchApp ID
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    tier: v.union(
      v.literal("free"),
      v.literal("member"),
      v.literal("vip"),
    ),
    profileComplete: v.boolean(),
    matchmakerNotes: v.optional(v.string()),     // AI summary from voice agent
    rejectionCount: v.number(),                   // Track for recalibration
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("recalibrating"),
    ),
    lastSyncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_smaId", ["smaId"])
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  // ── Matches ──
  matches: defineTable({
    smaIntroId: v.optional(v.string()),          // SMA intro ID
    memberAId: v.id("members"),                   // First person
    memberBId: v.id("members"),                   // Second person
    status: v.union(
      v.literal("pending"),                       // Created, not yet sent
      v.literal("sent_a"),                        // WhatsApp sent to member A
      v.literal("sent_b"),                        // WhatsApp sent to member B
      v.literal("a_interested"),                  // A said yes, waiting on B
      v.literal("b_interested"),                  // B said yes, waiting on A
      v.literal("mutual_interest"),               // Both said yes
      v.literal("group_created"),                 // WhatsApp group made
      v.literal("a_declined"),                    // A said no
      v.literal("b_declined"),                    // B said no
      v.literal("a_passed"),                      // A soft-passed (Past Intros)
      v.literal("b_passed"),                      // B soft-passed
      v.literal("personal_outreach_a"),           // A paid for outreach
      v.literal("personal_outreach_b"),           // B paid for outreach
      v.literal("completed"),                     // Intro done
      v.literal("expired"),                       // No response timeout
    ),
    triggeredBy: v.id("admins"),                  // Who started the flow
    groupChatId: v.optional(v.string()),          // Twilio group conversation SID
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_memberA", ["memberAId"])
    .index("by_memberB", ["memberBId"])
    .index("by_status", ["status"]),

  // ── Feedback ──
  feedback: defineTable({
    matchId: v.id("matches"),
    memberId: v.id("members"),
    decision: v.union(
      v.literal("interested"),
      v.literal("not_interested"),
      v.literal("passed"),
    ),
    // "Not Interested" categories (from diagram)
    categories: v.optional(v.array(v.union(
      v.literal("physical_attraction"),
      v.literal("photos_only"),
      v.literal("chemistry"),
      v.literal("willingness_to_meet"),
      v.literal("age_preference"),
      v.literal("location"),
      v.literal("career_income"),
      v.literal("something_specific"),
    ))),
    freeText: v.optional(v.string()),
    voiceNote: v.optional(v.string()),            // Storage ID if voice note
    smaMatchNotesSynced: v.boolean(),             // Written to SMA?
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"]),

  // ── Conversations (WhatsApp message log) ──
  whatsappMessages: defineTable({
    matchId: v.optional(v.id("matches")),
    memberId: v.id("members"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    messageType: v.union(
      v.literal("text"),
      v.literal("interactive"),
      v.literal("template"),
      v.literal("media"),
    ),
    content: v.string(),
    twilioSid: v.optional(v.string()),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"])
    .index("by_created", ["createdAt"]),

  // ── Payments ──
  payments: defineTable({
    matchId: v.id("matches"),
    memberId: v.id("members"),
    type: v.literal("personal_outreach"),
    amount: v.number(),                           // In cents
    phase: v.union(
      v.literal("initial"),                       // $125 upfront
      v.literal("completion"),                    // $125 if agreed
    ),
    stripeSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"]),

  // ── Audit Log ──
  auditLogs: defineTable({
    adminId: v.optional(v.id("admins")),
    action: v.string(),
    resource: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),
});
```

---

## Agent Swarm Organization

The convex/ folder is organized so **multiple agents/devs can work in parallel without conflicts:**

| Folder | Owner/Focus | Independent? |
|---|---|---|
| `convex/auth/` | Auth system | Yes — standalone |
| `convex/agents/` | AI agent definitions | Yes — imports tools |
| `convex/workflows/` | Durable flows | Depends on agents + integrations |
| `convex/integrations/twilio/` | WhatsApp messaging | Yes — standalone |
| `convex/integrations/smartmatchapp/` | CRM sync | Yes — standalone |
| `convex/integrations/stripe/` | Payments | Yes — standalone |
| `convex/matches/` | Match domain | Core — used by workflows |
| `convex/members/` | Member domain | Core — used by workflows |
| `convex/feedback/` | Feedback domain | Yes — writes to matches |
| `convex/analytics/` | Dashboard queries | Read-only — no conflicts |
| `convex/crons/` | Scheduled jobs | Depends on workflows |
| `src/app/dashboard/` | Dashboard pages | Frontend only |
| `src/components/` | UI components | Frontend only |

**Rules for parallel work:**
1. `schema.ts` is the shared contract — changes need coordination
2. Each integration folder is fully independent
3. Agent definitions import tools but don't modify integrations
4. Workflows orchestrate agents + integrations but live separately
5. Frontend pages only import from `convex/_generated/api` — never direct imports

---

## Environment Variables

```env
# Convex
NEXT_PUBLIC_CONVEX_URL=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# SmartMatchApp
SMA_API_BASE_URL=https://club-allenby.smartmatchapp.com/api
SMA_API_KEY=

# AI (for Convex Agent)
OPENAI_API_KEY=              # or ANTHROPIC_API_KEY

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_MAIN_DOMAIN=
```

---

## Build Order

### Phase 1: Foundation
1. Init Next.js + Convex project
2. Copy auth system from agent-analog
3. Copy UI components from agent-analog
4. Set up dashboard layout (sidebar, header, pages)
5. Deploy to Vercel + Convex Cloud

### Phase 2: Core Domain
6. Implement members table + SMA sync (mock first)
7. Implement matches table + CRUD
8. Build matches dashboard page
9. Build members dashboard page

### Phase 3: WhatsApp Bot
10. Set up Twilio integration
11. Build matchFeedback agent (the 8-category flow)
12. Build matchFlow workflow (durable state machine)
13. Wire up webhook → agent → response pipeline
14. Build conversation view on dashboard

### Phase 4: Advanced Flows
15. Group chat creation (mutual interest)
16. Personal Outreach + Stripe checkout
17. Recalibration flow (3 rejections)
18. 4-day follow-up cron job

### Phase 5: Analytics & Polish
19. Dashboard analytics (response rates, feedback breakdown)
20. Real-time activity feed
21. Audit logging
22. Testing + QA
