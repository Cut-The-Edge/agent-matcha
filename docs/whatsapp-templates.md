# WhatsApp Pre-Approved Templates

All outbound WhatsApp messages outside the 24h session window must use
pre-approved Content Templates registered in the Twilio Console.

## Template Registry

Templates are defined in `convex/integrations/twilio/templates.ts` and
referenced by `templateKey` in flow node configs.

### matcha_match_intro

| Field | Value |
|---|---|
| **Content SID** | `HX223e495be05f09fa7dc56f05610df67b` |
| **Registry Key** | `MATCH_INTRO` |
| **Type** | Quick Reply |
| **Body** | "Hey {{1}}! Great news — we have a potential match for you. Would you like to hear more about them?" |
| **Variables** | `{{1}}` = memberName |
| **Buttons** | "Yes, tell me more!" (`interested`) / "Not right now" (`not_now`) |
| **Used by** | `decision_response` (initial match intro) |

### matcha_match_nudge

| Field | Value |
|---|---|
| **Content SID** | `HX8715beeee12a1b184928bf9b5d90124b` |
| **Registry Key** | `MATCH_NUDGE` |
| **Type** | Text |
| **Body** | "Hey {{1}}, just checking in — we shared a match with you recently and would love to hear your thoughts. Reply anytime!" |
| **Variables** | `{{1}}` = memberName |
| **Used by** | `msg_nudge_why_not`, `msg_nudge_more_reasons`, `msg_nudge_upsell`, `msg_nudge_interested_outreach` |

### matcha_match_decision

| Field | Value |
|---|---|
| **Content SID** | `HXccf3eaee4c50958995cb2a1c48406967` |
| **Registry Key** | `MATCH_DECISION` |
| **Type** | Quick Reply |
| **Body** | "Hey {{1}}, we think you and {{2}} could be a great match! Would you like to connect?" |
| **Variables** | `{{1}}` = memberName, `{{2}}` = matchName |
| **Buttons** | "I'm interested!" (`interested`) / "Not for me" (`not_interested`) / "Tell me more" (`tell_me_more`) |
| **Used by** | `decision_response_day2`, `decision_response_day5`, `decision_response_day7` |

### matcha_welcome

| Field | Value |
|---|---|
| **Content SID** | `HXc0a86dde028e42b5678481fedc0151d2` |
| **Registry Key** | `WELCOME` |
| **Type** | Text |
| **Body** | "Hey {{1}}! Welcome to Club Allenby. We'd love to get to know you better and complete your matchmaking profile. Reply here to get started!" |
| **Variables** | `{{1}}` = memberName |
| **Used by** | Welcome/onboarding flows (future) |

### matcha_match_expired

| Field | Value |
|---|---|
| **Content SID** | `HX6d2e86534a07b302c1d68c7768f99f81` |
| **Registry Key** | `MATCH_EXPIRED` |
| **Type** | Text |
| **Body** | "Hey {{1}}, we noticed you haven't had a chance to respond about your recent match. No worries — when you're ready, just reply here and we'll pick up where we left off!" |
| **Variables** | `{{1}}` = memberName |
| **Used by** | `msg_expire_day8`, `msg_midflow_expire` |

## Architecture

```
Flow Node (matchIntroFlowData.ts)
  └─ config.templateKey: "MATCH_NUDGE"
       │
       ▼
transitions.ts  ──passes templateKey──▶  executor.ts
                                           │
                                    ┌──────┴──────┐
                                    │ templateKey? │
                                    └──────┬──────┘
                              yes ◄────────┴────────► no
                               │                       │
                      templates.ts              whatsapp.ts
                    (sendTemplateMessage)     (sendTextMessage)
                     ContentSid + vars         or interactive.ts
                                             (numbered text fallback)
```

## Rules

1. **Never create templates on-the-fly.** The old `matcha_qr_*` / `matcha_lp_*`
   approach is removed. All template creation happens in the Twilio Console.
2. **Template mode** sends via `ContentSid` + `ContentVariables`. Works outside
   the 24h session window.
3. **Session mode** sends numbered text. Works only within the 24h window.
4. Flow nodes without a `templateKey` use session mode automatically.
5. To add a new template: create it in Twilio Console, add its SID to
   `WA_TEMPLATES` in `templates.ts`, then reference the key in the flow node.

## Cleanup

Run `cleanupJunkTemplates` (in `convex/integrations/twilio/cleanupTemplates.ts`)
to delete all `matcha_qr_*` and `matcha_lp_*` templates from Twilio.
