# SmartMatchApp Integration Guide for Agent Matcha

## Table of Contents
- [Overview](#overview)
- [Club Allenby Context](#club-allenby-context)
- [API Documentation](#api-documentation)
- [Data Models](#data-models)
- [Key Integration Points for Agent Matcha](#key-integration-points-for-agent-matcha)
- [Authentication](#authentication)
- [Zapier Integration (Alternative Path)](#zapier-integration-alternative-path)
- [M Suite (Marketing Suite)](#m-suite-marketing-suite)
- [Sandbox and Testing](#sandbox-and-testing)
- [Gaps and Unknowns](#gaps-and-unknowns)
- [Integration Architecture Recommendations](#integration-architecture-recommendations)

---

## Overview

### What is SmartMatchApp?

SmartMatchApp (SMA) is an **award-winning, cloud-based matchmaking and membership management CRM** developed by **SmartMatch Systems Inc.** (founded 2016). It services **100,000+ users worldwide** across industries including dating, business networking, mentoring, peer support, events, education, and associations.

**Website:** https://smartmatchapp.com
**Parent Company:** SmartMatch Systems Inc.
**Sister Company:** SmartNext Studio (web development agency)
**Speed Dating Product:** SpeedMatchApp
**Compliance:** GDPR, EU-US Privacy Shield, PIPEDA, SOC2

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Matching** | AI-powered algorithms with predicted success percentages, ranked suggestions |
| **Introductions** | Personalized introductions with photos, videos, profiles |
| **Communications** | Email (personal + group), SMS (Twilio), notifications, reminders |
| **Web Forms** | Custom submission forms for data collection |
| **Member Portal** | Client self-service: profile updates, match viewing, chat, calendar availability |
| **Custom Database** | Fully customizable fields, client types, lists, tags |
| **Timeline/Activity** | Full history of profile updates, emails, SMS, notes, matches, calls |
| **Notes** | Client notes and match notes with full audit trail (create, edit, delete all logged) |
| **Scheduling** | Cross-availability feature, date/meeting booking |
| **Surveys** | Feedback collection from clients |
| **Reporting** | Custom reports with wide range of filters |
| **Tasks** | Project management, task assignment, priorities, due dates |
| **Integrations** | Zapier (3,000+ apps), custom open API, Stripe, Twilio |
| **White Label** | Custom branding, private domain, logos, colors |
| **Contracts** | Client contracts with expiry dates |
| **Media** | Photos, videos, documents storage and sharing |

### Pricing Plans

| Plan | Price | Target |
|------|-------|--------|
| **Essential** | $19/admin/month | Solo matchmakers, small teams |
| **Advanced** | $39/admin/month | Growing teams needing flexibility, customization, analytics |
| **Ultimate** | $59/admin/month | Large networks, multi-team setups, advanced needs |

- No setup fees, no long-term contracts
- API access appears to be available as an **Add-on** (accessible via Account > Add-ons > API)

---

## Club Allenby Context

### Confirmed: Club Allenby Uses SmartMatchApp

Club Allenby has an active SmartMatchApp instance at:
- **Subdomain:** `club-allenby.smartmatchapp.com`
- **Submission Form URL:** `https://club-allenby.smartmatchapp.com/client/submissionform/54/default/`

### Club Allenby Profile

- **Founder:** Dani Bergman
- **Type:** Matchmaking-driven social club focused on Jewish singles
- **Location:** Miami (also events in NYC, LA, Tel Aviv)
- **Services:** Curated matchmaking, Shabbat dinners, Stoplight parties, wellness events
- **Membership Tiers:** Free (database entry, event invitations) and Paid (curated match suggestions, private events, partner perks)
- **Paid Members Get:** 1 complimentary Shabbat dinner/month + 2 curated match suggestions/month

### Club Allenby Submission Form Fields

Based on the intake form at `club-allenby.smartmatchapp.com`, the client profile includes:

1. **Membership Information** - tier/type
2. **Basic Information** - name, phone, email, demographics
3. **Career** - occupation, industry
4. **Background and Education** - education level, background
5. **Interests & Social Life** - hobbies, social preferences
6. **Family + Relationships** - family status, relationship history
7. **Match Preferences** - what they're looking for in a match

### Club Allenby Matchmaking Flow

Per their Terms & Conditions:
1. Users submit intake form or attend events
2. Added to internal database
3. If compatibility match identified, **automatic introduction email** sent to both parties
4. Introduction includes: first name, curated profile summary, photos
5. Contact info (email/phone) NOT shared without prior written consent
6. If both parties express interest, Club Allenby facilitates next steps **manually**

---

## API Documentation

### API Access Location

The API documentation is accessible **inside the SmartMatchApp admin panel**:
- Navigate to: **Account > Add-ons > API > API Documentations**
- This contains a list of all available API calls with technical documentation

**CRITICAL NOTE:** The API docs are behind authentication -- they are NOT publicly available on the web. We need access to Club Allenby's SmartMatchApp admin panel or need Dani to provide the API documentation.

### What We Know About the API

From the YouTube video "Use SmartMatchApp as Your Matchmaking Backend" (April 2025) and other sources:

#### API Version
- A **new version of the API** was released in early-to-mid 2025
- Previous API had significant limitations; the new version removed many of them
- SmartMatchApp can now be used as a **full backend** for custom frontends
- They describe it as enabling "completely customizable UI user experience for clients on any device"

#### Known API Capabilities (from video transcript)

The API supports **bidirectional** data transfer:

| Data Type | Direction | Description |
|-----------|-----------|-------------|
| **Client Profiles** | Read/Write | Transfer profiles from SMA to frontend and back |
| **Preferences** | Read/Write | Transfer match preferences both ways |
| **Suggestions** | Read | Get AI-generated match suggestions with percentages |
| **Matches** | Read/Write | Match data, updated files |
| **Files/Folders** | Read/Write | Upload CVs, resumes, photos, videos, documents |

#### API Endpoint Evidence

From Zapier integration, we know these API operations exist:

| Operation | Type | Description |
|-----------|------|-------------|
| **New, Updated or Deleted Client** | Trigger/Webhook | Fires when a client record changes |
| **Create Client** | Action | Creates a new client (deprecated, use Create or Update) |
| **Update Client** | Action | Updates an existing client (deprecated, use Create or Update) |
| **Create or Update Client** | Action | Upsert operation -- create or update a client |
| **Find Client** | Search | Lookup a client by criteria |
| **Upload Photos** | Action | Uploads a list of photos for a client |

#### Inferred Additional API Endpoints

Based on the features list and video, these endpoints likely exist:

- `POST /api/client` - Create client
- `PUT /api/client/{id}` - Update client
- `GET /api/client/{id}` - Get client profile
- `GET /api/client/search` - Search/find clients (possibly by phone, email, name, tags)
- `POST /api/client/{id}/photos` - Upload photos
- `GET /api/client/{id}/suggestions` - Get match suggestions
- `GET /api/client/{id}/matches` - Get matches
- `POST /api/client/{id}/notes` - Add notes to client profile
- `GET /api/client/{id}/timeline` - Get activity timeline
- `POST /api/client/{id}/files` - Upload files

**These are INFERRED -- actual endpoints need to be confirmed from the API documentation.**

### API Tracker Profile (apitracker.io)

According to API Tracker:
- **API Styles:** Not specified
- **Developer Docs:** Available (behind auth)
- **Webhooks:** Webhooks management API available
- **OpenAPI/Swagger:** Specs available (Run in Postman / Run in Insomnia)
- **Sandbox:** Information not publicly listed
- **Authentication:** Available (method not specified publicly)
- **Postman/Insomnia Collections:** Available

### Custom API Requests

From the video transcript: "We can even do it per request. It's not so complex to add additional API calls." This suggests SmartMatchApp is willing to build **custom API endpoints** for specific client needs.

---

## Data Models

### Client/Contact Profile

Based on the Club Allenby form and SMA features:

```
Client {
  // System fields
  id: string
  created_at: datetime
  updated_at: datetime
  status: string (active, archived)
  client_type: string (custom defined)
  tags: string[]
  lists: string[]

  // Basic Information
  first_name: string
  last_name: string
  email: string
  phone: string
  // ... demographics (age, gender, location, etc.)

  // Custom Fields (configurable per org)
  custom_fields: {
    // Club Allenby has:
    // - Career fields
    // - Background and Education
    // - Interests & Social Life
    // - Family + Relationships
    // - Match Preferences
    [field_name: string]: any
  }

  // Media
  photos: Photo[]
  videos: Video[]
  files: File[]

  // Matchmaking
  match_preferences: MatchPreferences
  profile_completeness: number (0-100%)
}
```

### Notes

SmartMatchApp supports two types of notes:

```
Note {
  id: string
  client_id: string
  content: string
  created_by: string (agency user)
  created_at: datetime
  updated_at: datetime
  // Full audit trail: create, edit, delete all logged in Timeline
}

MatchNote {
  id: string
  match_id: string
  content: string
  created_by: string
  created_at: datetime
  updated_at: datetime
}
```

**"Allenby Notes"** likely refers to internal notes written by Club Allenby staff on client profiles. These would be standard SMA client notes.

### Match

```
Match {
  id: string
  client_a_id: string
  client_b_id: string
  match_percentage: number  // AI-predicted success %
  status: string
  match_notes: MatchNote[]
  created_at: datetime
}
```

### Match Suggestions

```
Suggestion {
  client_id: string
  suggested_match_id: string
  predicted_success_percentage: number
  matching_criteria_report: object  // Detailed report on matching criteria
  rank: number  // Suggestions ranked by system
}
```

### Timeline/Activity

```
TimelineEntry {
  id: string
  client_id: string
  event_type: string  // profile_created, profile_updated, note_created,
                      // note_edited, note_deleted, match_created,
                      // email_sent, sms_sent, introduction_sent, etc.
  actor: string  // Agency user who performed action
  timestamp: datetime
  details: object
}
```

---

## Key Integration Points for Agent Matcha

### 1. Phone Number Lookup (Check if Caller Exists)

**Goal:** When a call comes in, look up the caller by phone number to determine if they're an existing client.

**Approach:**
- Use the **Find Client** API endpoint (confirmed via Zapier search action)
- Search by phone number field
- Returns client profile if found, null/empty if not

**Confidence Level:** HIGH -- Find Client is a confirmed Zapier action, and phone number is a standard profile field.

**Unknown:** Exact API endpoint and query parameter format. Need to confirm that phone number is a searchable field via the API (it almost certainly is, given web form collection).

### 2. Create/Update Contact Profiles

**Goal:** Create new profiles for unknown callers, update existing profiles with new information from calls.

**Approach:**
- Use **Create or Update Client** API endpoint (confirmed via Zapier)
- This is an upsert operation
- Can set custom fields, tags, lists

**Confidence Level:** HIGH -- this is a confirmed, actively-used Zapier action.

**Integration Flow:**
```
Caller not found -> Create new client with phone, name (from conversation)
Caller found -> Update client with any new info gathered during call
```

### 3. Write Notes (Transcript + AI Summary)

**Goal:** After each call, write the call transcript and AI-generated summary as notes on the client profile.

**Approach:**
- Use the **Notes API** to create a note on the client profile
- Include: call timestamp, full transcript, AI summary, key topics discussed
- Notes are fully audited in Timeline (create, edit, delete tracked)

**Confidence Level:** MEDIUM -- Notes are a core SMA feature with full timeline tracking, and the API video mentions transferring various data types. However, a specific "Create Note" API endpoint is NOT explicitly confirmed via public sources. Need to verify in API docs.

**Fallback:** If no direct Notes API, could potentially use Zapier as middleware or ask SmartMatchApp to add a custom API endpoint for notes.

### 4. Match Generation Trigger

**Goal:** Trigger SmartMatchApp's matching algorithm to run for a given client.

**Approach:**
- SMA has "Calibrated Smart algorithms" that suggest matches automatically
- The system generates "predicted relationship success percentage"
- Triggers may be automatic (profile update triggers re-matching) or manual

**Confidence Level:** LOW-MEDIUM -- The matching algorithm is a core feature, but it's unclear whether it can be **triggered programmatically via the API** or if it runs on its own schedule/criteria. The system does auto-generate suggestions.

**Possible approaches:**
1. Profile update via API may auto-trigger re-matching
2. There may be a dedicated API endpoint to trigger matching
3. May need to be triggered manually by a matchmaker in the SMA UI
4. Could potentially use automations/triggers within SMA

**Unknown:** Need to check API docs or ask Dani/SMA team about programmatic match triggering.

### 5. Reading Match Results

**Goal:** Retrieve match suggestions and results for a given client.

**Approach:**
- API video confirms **suggestions with percentages** can be transferred to frontends
- Match data is bidirectional
- Ranked suggestions pushed to top based on client info and preferences

**Confidence Level:** HIGH -- explicitly mentioned in the API video as a key use case.

---

## Authentication

### What We Know

- SmartMatchApp requires authentication for API access
- API documentation is accessible at: Account > Add-ons > API
- The API is an add-on feature (may require specific plan or add-on activation)
- Zapier integration uses its own auth mechanism (API key or OAuth to connect the Zapier app)

### Likely Authentication Methods

Based on industry standards and the API Tracker profile:

1. **API Key** - Most likely. An API key generated in the SMA admin panel under Add-ons > API
2. **OAuth** - Possible but less likely for a CRM of this size
3. **Session-based** - Unlikely for an open API

**Need to confirm:** Authentication method and how to obtain API credentials from the SMA admin panel.

---

## Zapier Integration (Alternative Path)

SmartMatchApp has a **full Zapier integration** that could serve as a fallback or supplementary integration method.

### Available Zapier Actions/Triggers

| Type | Name | Status |
|------|------|--------|
| **Trigger** | New, Updated or Deleted Client | Active |
| **Action** | Create or Update Client | Active (recommended) |
| **Action** | Upload Photos for Client | Active |
| **Action** | Create Client | Deprecated |
| **Action** | Update Client | Deprecated |
| **Search** | Find Client | Active |

### Zapier as Integration Bridge

If direct API access proves limited, Zapier could be used as middleware:
1. Agent Matcha -> Zapier Webhook -> SmartMatchApp actions
2. SmartMatchApp triggers -> Zapier -> Agent Matcha webhook

**Pros:** Already working, proven integration, no API key management
**Cons:** Added latency, Zapier costs, limited to available triggers/actions, not real-time enough for call handling

---

## M Suite (Marketing Suite)

### What is M Suite?

There are **two different products** named "M Suite" that appear in search results. Clarification is needed on which one is relevant:

### Option A: SmartMatchApp Marketing Suite ("MSuite")

- **Full Name:** SmartMatchApp Marketing Suite (MSuite)
- **Relationship:** An official SmartMatchApp product / add-on
- **Purpose:** Sales + marketing CRM built specifically for matchmakers
- **Demo link:** `link.msuite.smartmatchapp.com`
- **YouTube:** "Save 50 Hours a Week With Automated Follow-Ups + Intake" and "How Matchmakers Automate Follow-Ups, Intake, and Contracts"
- **Features:** Automated follow-ups, intake forms, contract management
- **Integration with SMA:** Native -- it IS part of the SmartMatchApp ecosystem

**This appears to be the most likely "M Suite" referenced in the Agent Matcha context.** It extends SmartMatchApp with automated sales and marketing workflows specifically for matchmakers.

### Option B: M Suite by Micu Growth

- **Website:** msuitecrm.io
- **Powered by:** Micu Growth (coaching/consulting firm)
- **Founders:** Gary Micu Jr. (Grant Cardone Certified Coach/CPA) and Mariella Micu
- **Type:** General-purpose business operating system/CRM
- **Price:** $499+/month
- **Features:** CRM, pipeline, funnels, websites, workflow automations, email marketing, phone/SMS, reputation management
- **Replaces:** HubSpot, PipeDrive, Zoho, Monday.com, Calendly, Twilio, etc.
- **Instagram connection:** An Instagram post from SmartMatchApp mentions M-Suite as "your all-in-one sales + marketing CRM built just for matchmakers"

**Assessment:** The Instagram evidence suggests M Suite by Micu Growth may have a **partnership or white-label relationship** with SmartMatchApp, where M Suite is positioned as the sales/marketing layer that works alongside SmartMatchApp's matchmaking CRM. The Instagram reel shows "OCR. Sma PS SO MSUITE" suggesting co-branding.

### Recommendation

Ask Dani (Club Allenby) whether they use M Suite and, if so, whether it's the SmartMatchApp MSuite or the Micu Growth M Suite. This determines whether we need to integrate with one system or two.

---

## Sandbox and Testing

### Current Knowledge

- **Sandbox Environment:** Not publicly documented on API Tracker
- **Free Trial:** SmartMatchApp offers a free trial
- **Demo:** Free demo available via `calendly.com` booking

### Recommended Approach

1. Request **API sandbox/test credentials** from SmartMatchApp directly
2. Alternatively, sign up for a **free trial** to explore the API documentation
3. Contact SmartMatchApp support: `support@smartmatchapp.com`
4. Contact Arthur Lavrinovich (Sales): `arthur@smartmatchapp.com`
5. Or ask Dani if we can get developer access to the Club Allenby SMA instance

---

## Gaps and Unknowns

### Critical (Must Resolve Before Building)

| # | Gap | Impact | How to Resolve |
|---|-----|--------|----------------|
| 1 | **Full API documentation** -- actual endpoints, request/response formats, rate limits | Cannot build integration without this | Get API docs from SMA admin panel (Dani access) or request from SMA team |
| 2 | **Authentication method** -- API key format, token management, scoping | Cannot authenticate API calls | Check SMA admin panel > Add-ons > API |
| 3 | **Notes API** -- can we create/read notes via API? | Core requirement for call transcripts | Check API docs or ask SMA team |
| 4 | **Phone number lookup** -- exact search endpoint and parameters | Core requirement for caller identification | Check API docs; likely supported via Find Client |
| 5 | **Match trigger mechanism** -- can matching be triggered via API? | Affects whether we can auto-trigger match generation post-call | Check API docs or ask SMA team |

### Important (Need Before Production)

| # | Gap | Impact | How to Resolve |
|---|-----|--------|----------------|
| 6 | **Rate limits** -- API call frequency limits | Affects call handling capacity | Check API docs |
| 7 | **Webhook support** -- can we receive real-time events? | Affects push vs poll architecture | API Tracker says webhooks available; confirm |
| 8 | **Which M Suite is relevant** | Determines if we need dual integration | Ask Dani |
| 9 | **API pricing** -- is there per-call pricing or included in plan? | Affects operational costs | Ask SMA team or check plan features |
| 10 | **Custom fields mapping** -- exact field names and IDs for Club Allenby's custom fields | Needed for accurate profile creation | Get from Club Allenby's SMA admin panel |

### Nice to Have

| # | Gap | Impact | How to Resolve |
|---|-----|--------|----------------|
| 11 | **OpenAPI/Swagger spec** | Would speed up development | API Tracker says available; try to obtain |
| 12 | **Postman collection** | Quick testing and exploration | API Tracker says available |
| 13 | **Bulk operations** | Efficiency for batch updates | Check API docs |

---

## Integration Architecture Recommendations

### Recommended Architecture: Direct API Integration

```
                    +------------------+
                    |   Incoming Call   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |  Voice AI Agent  |
                    |  (Agent Matcha)  |
                    +--------+---------+
                             |
               +-------------+-------------+
               |                           |
    +----------v----------+     +----------v----------+
    | SmartMatchApp API   |     | AI Processing       |
    | Connector Service   |     | (Summary, Analysis) |
    +----------+----------+     +----------+----------+
               |                           |
               |         +--------+        |
               +-------->| SMA DB |<-------+
                         +--------+
```

### Integration Flow for a Call

```
1. CALL STARTS
   -> Extract caller phone number from telephony provider

2. CALLER LOOKUP
   -> GET /api/client/search?phone={phone_number}
   -> If found: load full profile for context
   -> If not found: flag as new caller

3. DURING CALL
   -> Voice AI uses client profile context (if available)
   -> Real-time transcript generation
   -> AI extracts key information (preferences, updates, etc.)

4. CALL ENDS
   -> AI generates call summary
   -> AI extracts structured data (preference changes, new info, etc.)

5. POST-CALL PROCESSING
   -> If new caller:
      POST /api/client (create with phone, name, extracted info)
   -> If existing caller:
      PUT /api/client/{id} (update with any new info)
   -> POST /api/client/{id}/notes
      (write transcript + AI summary as note)
   -> Optionally trigger match generation

6. MATCH RESULTS (async)
   -> Poll or webhook for new match suggestions
   -> Could be used for follow-up outreach
```

### Technology Recommendations

1. **Build a SmartMatchApp Connector Service** -- a thin wrapper around the SMA API that handles:
   - Authentication and token management
   - Client lookup by phone number
   - Profile CRUD operations
   - Notes creation
   - Match suggestion retrieval
   - Error handling and retries

2. **Use Zapier as a fallback** -- for any operations the direct API doesn't cover, set up Zapier workflows as backup

3. **Consider webhooks** -- if SMA supports webhooks (API Tracker indicates yes), use them for:
   - New match notifications
   - Profile update notifications
   - Client status changes

### Immediate Next Steps

1. **Request API access** -- Contact Dani to get:
   - Login to Club Allenby's SMA admin panel (or API credentials)
   - Access to Add-ons > API > API Documentation
   - List of custom fields configured for Club Allenby

2. **Get the OpenAPI/Swagger spec or Postman collection** -- This will give us exact endpoints

3. **Set up a test environment** -- Either:
   - Use Club Allenby's SMA with test data
   - Request a sandbox from SmartMatchApp
   - Sign up for a free trial

4. **Clarify M Suite relationship** -- Ask Dani which M Suite they use and whether we need to integrate with it

5. **Contact SmartMatchApp dev team** -- If custom API endpoints are needed (e.g., notes creation, match triggering), they've indicated willingness to build custom endpoints per client request

---

## Key Contacts

| Contact | Role | Email |
|---------|------|-------|
| Dani Bergman | Club Allenby Founder (Client) | info@cluballenby.com |
| Arthur Lavrinovich | SmartMatchApp Sales | arthur@smartmatchapp.com |
| SmartMatchApp Support | General Support | support@smartmatchapp.com |
| Tim | SmartMatchApp (appears in videos) | Via SMA support |
| Mykola/Nikolai | SmartMatchApp Developer (appears in API video) | Via SMA support |

---

## Summary

SmartMatchApp is a well-established matchmaking CRM that Club Allenby actively uses. The platform has a **confirmed API** (new version released 2025) that supports bidirectional data transfer for client profiles, preferences, match suggestions, and files. The API documentation is behind authentication in the SMA admin panel.

**The biggest blocker** is obtaining the actual API documentation from inside Club Allenby's SmartMatchApp instance. Once we have that, building the integration connector should be straightforward -- the system already supports the core operations we need (client lookup, profile management, and likely notes).

The **match generation trigger** is the most uncertain integration point and may require coordination with the SmartMatchApp team for a custom endpoint or workaround.
