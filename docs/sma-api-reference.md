# SmartMatchApp API Reference — Club Allenby

> Extracted from `https://club-allenby.smartmatchapp.com/api/base/#!/api3/doc/`
> Last updated: 2026-03-04

---

## Authentication

- **Method**: HTTP Basic Auth
- **Format**: `-u <token>:` (token as username, empty password)
- **Header equivalent**: `Authorization: Basic <base64(token:)>`

## Base URL

```
https://club-allenby.smartmatchapp.com/api3/
```

## Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| List / Read endpoints | 30 requests / 5 seconds |
| Update Profile | 10 requests / 10 seconds |
| Update Preferences | 10 requests / 10 seconds |
| Create Client | 30 requests / 5 seconds |

---

## Endpoints

### 1. List All Clients

```
GET /api3/clients/
```

Returns a paginated list of clients sorted by creation date (most recent first). By default only IDs are returned — use `field` param to include profile/preference data.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `count` | int | Results per page (default: 20) |
| `offset` | int | Offset from beginning of list |
| `field` | string | Profile/pref field to include in response (up to 10, repeat param) |
| `prof_X` | varies | Filter by profile field value |
| `pref_X` | varies | Filter by preference field value |
| `lists` | int | Filter by list ID (repeat for multiple) |

**Phone lookup example:**
```bash
curl "https://club-allenby.smartmatchapp.com/api3/clients/?prof_243=+15551234567&field=prof_239&field=prof_241&field=prof_243" \
  -u <token>: -X GET
```

**Response:**
```json
{
  "total_count": 2,
  "count": 2,
  "offset": 0,
  "objects": [
    {
      "id": 1,
      "is_archived": false,
      "is_submitted": false,
      "stype": { "id": 2, "name": "Retailer" },
      "prof_1": "text"
    }
  ]
}
```

---

### 2. Create a New Client

```
POST /api3/clients/
```

Creates a client shell record. Returns the new client ID. Profile data is set separately via Update Client Profile.

**Form fields:**

| Field | Type | Description |
|-------|------|-------------|
| `stype` | int | Client type ID (optional) |
| `is_submitted` | bool | Whether client is submitted (optional) |
| `is_archived` | bool | Whether client is archived (optional) |
| `created` | datetime | ISO 8601 format, defaults to now (optional) |
| `assigned_users` | int | Agency user IDs to assign (repeat for multiple) |

**Response:**
```json
{ "id": 2 }
```

---

### 3. Update Client Profile

```
PUT /api3/clients/<client_id>/profile/
```

Update profile fields for a specific client. Send form data with `prof_X` field names.

**Response:** `HTTP 204 No Content` on success.

**Location fields** use sub-fields: `prof_244_country`, `prof_244_city`, etc.

**Select/MultiSelect fields** require integer IDs (see Field Values section below).

**Example:**
```bash
curl "https://club-allenby.smartmatchapp.com/api3/clients/123/profile/" \
  -u <token>: -X PUT \
  -F prof_239="Sarah" \
  -F prof_241="Cohen" \
  -F prof_243="+15551234567" \
  -F prof_163="Attorney" \
  -F prof_144=4 \
  -F prof_187=1
```

---

### 4. Retrieve Client Details

```
GET /api3/clients/<client_id>/
```

Returns the shell record for a client (not profile data — use Retrieve Client Profile for that).

**Response:**
```json
{
  "id": 1,
  "is_archived": false,
  "is_submitted": false,
  "created": "2022-01-01T10:00:00Z",
  "stype": { "id": 5, "name": "Company" },
  "assigned_users": [
    { "id": 1, "name": "John Doe", "email": "john@gmail.com" }
  ]
}
```

---

### 5. Update Client Details

```
PUT /api3/clients/<client_id>/
```
> TODO: Document when provided

---

### 6. Retrieve Client Profile

```
GET /api3/clients/<client_id>/profile/
```

Returns the full profile organized into groups. Each group has a `group_name`, `group_id`, and `fields` dict.

**Response structure:**
```json
[
  {
    "group_name": "Profile Group",
    "group_id": 1,
    "fields": {
      "prof_XXX": {
        "label": "Field Name",
        "type": "Short Text",
        "value": "the value"
      }
    }
  }
]
```

**Value formats by type:**

| Type | Value format |
|------|-------------|
| Short Text, Long Text | `"string"` |
| Integer Number | `102` |
| Fractional Number | `1500000.50` |
| Date | `"2023-01-15"` |
| Birthday (Age) | `"1990-05-20"` |
| Time | `"14:30:00"` |
| Yes/No | `true` / `false` |
| Select | `{ "choice": 1, "choice_label": "Premium" }` |
| MultiSelect | `[{ "choice": 1, "choice_label": "Red" }, ...]` |
| PhoneNumber | `"+123 987 6543"` |
| Location | `{ "country": "CA", "city": "Vaughan", "state": "ON", "zip_code": "L6A 1S6", "suit": "", "street": "", "distance": "" }` |
| Image / File | `{ "name": "pic.jpg", "url": "https://..." }` |
| Height (ft & in) | Integer in mm (e.g., `1829` = 6'0") |
| Web Link | `"https://..."` |

**Height (ft & in) lookup — `prof_170` and `pref_47`:**

| Value | Height |
|-------|--------|
| 1524 | 5' 0" |
| 1549 | 5' 1" |
| 1575 | 5' 2" |
| 1600 | 5' 3" |
| 1626 | 5' 4" |
| 1651 | 5' 5" |
| 1676 | 5' 6" |
| 1702 | 5' 7" |
| 1727 | 5' 8" |
| 1753 | 5' 9" |
| 1778 | 5' 10" |
| 1803 | 5' 11" |
| 1829 | 6' 0" |
| 1854 | 6' 1" |
| 1880 | 6' 2" |
| 1905 | 6' 3" |
| 1930 | 6' 4" |
| 1956 | 6' 5" |
| 1981 | 6' 6" |

**Club Allenby Profile Groups:**

| Group | ID | Fields |
|-------|----|--------|
| Sidebar | 44 | Name, email, phone, location, cover photo |
| Membership Information | 7 | Referral, social media, how heard, membership type, consent |
| Basic Information | 1 | Gender, orientation, birthdate, age, relationship status, ethnicity, height, hair, eyes, languages, politics, smoke, drink, pets, long-distance, looking for partner |
| Interests & Social Life | 10 | Interests, day in life, weekends, friends describe, organizations, personal growth, what you notice, **matchmaker notes** |
| Career | 9 | Occupation, career overview, income |
| Background and Education | 8 | Nationality, religion, Jewish observance, values, upbringing, education level, college details |
| Family + Relationships | 11 | Current relationship status, relationship history, children, children details, want more children |

---

### 7. Update Client Preferences

```
PUT /api3/clients/<client_id>/preferences/
```

Update preference fields for a specific client. Supports plain values, ranges, deal breakers, and field weights.

**Form field patterns:**

| Pattern | Description |
|---------|-------------|
| `pref_X` | Plain value (text, select ID, multiselect ID) |
| `pref_X_start` | Range start (for age, height, date, number ranges) |
| `pref_X_end` | Range end |
| `pref_X_deal_breaker` | `true`/`false` — marks as critical matching criterion |
| `pref_X_field_weight` | `1` (Low), `2` (Medium, default), `3` (High) — affects match % |
| `pref_X_country`, `pref_X_city` | Location sub-fields |

**Response:** `HTTP 204 No Content` on success.

**Example — set age range 25-35 as high-priority dealbreaker:**
```bash
curl "https://club-allenby.smartmatchapp.com/api3/clients/123/preferences/" \
  -u <token>: -X PUT \
  -F pref_1_start=25 \
  -F pref_1_end=35 \
  -F pref_1_deal_breaker=true \
  -F pref_1_field_weight=3
```

**Example — set partner personality + physical descriptions:**
```bash
curl "https://club-allenby.smartmatchapp.com/api3/clients/123/preferences/" \
  -u <token>: -X PUT \
  -F pref_23="Ambitious, family-oriented, funny, emotionally intelligent" \
  -F pref_19="Athletic build, dark hair, tall"
```

---

### 8. Retrieve Client Preferences

```
GET /api3/clients/<client_id>/preferences/
```

Returns preferences organized in groups. Each field includes `deal_breaker`, `weight`, and `value`.

**Response structure:**
```json
[
  {
    "group_name": "Match Preferences",
    "group_id": 2,
    "fields": {
      "pref_1": {
        "label": "What age range are you looking to date?",
        "type": "None",
        "deal_breaker": true,
        "weight": "High",
        "value": { "start": 25, "end": 35 }
      },
      "pref_23": {
        "label": "Please describe the personality...",
        "type": "Long Text",
        "deal_breaker": false,
        "weight": "Medium",
        "value": "Ambitious, family-oriented..."
      }
    }
  }
]
```

**Range fields** (age, height, date, number) return `{ "start": X, "end": Y }`.

**Select fields** return `{ "choice": 1, "label": "New" }` (note: `label` not `choice_label` like profile).

**Club Allenby default deal breakers and weights:**

| Field | Deal Breaker | Weight |
|-------|-------------|--------|
| `pref_36` Seeking partner who is | Yes | High |
| `pref_41` Sexual orientation | Yes | High |
| `pref_1` Age range | Yes | High |
| `pref_27` Religion | No | High |
| `pref_33` Smoking | No | High |
| `pref_51` Open to relocating | Yes | High |
| `pref_26` Ethnicity | No | Medium |
| `pref_28` Education | No | Medium |
| `pref_43` Income | No | Medium |
| `pref_47` Height range | No | Medium |
| `pref_48` Hair color | No | Medium |
| `pref_35` Political | No | Medium |
| `pref_34` Drinking | No | Medium |
| `pref_50` Children | No | Medium |
| `pref_84` Partner values | No | Medium |
| `pref_52` Partner interests | No | Medium |
| `pref_23` Personality desc | No | Medium |
| `pref_19` Physical desc | No | Medium |
| `pref_25` Relationship status | No | Low |
| `pref_49` Eye color | No | Low |

---

## Profile Fields (prof_*)

All fields for Club Allenby's client profiles.

### Text & Basic Fields

| Title | Field ID | Type |
|-------|----------|------|
| First Name | `prof_239` | Short Text |
| Middle Name | `prof_240` | Short Text |
| Last Name | `prof_241` | Short Text |
| Entity Name | `prof_238` | Short Text |
| Email | `prof_242` | Email |
| Phone | `prof_243` | PhoneNumber |
| Location | `prof_244` | Location |
| Birthdate | `prof_131` | Birthday (Age) |
| Age1 | `prof_233` | Short Text |
| Occupation | `prof_163` | Short Text |
| Languages spoken | `prof_161` | Short Text |
| Height (ft & in) | `prof_170` | Height (ft & in) |
| Cover Photo | `prof_237` | Image |

### Long Text Fields

| Title | Field ID |
|-------|----------|
| Career overview | `prof_184` |
| Upbringing & family values | `prof_182` |
| College/university details | `prof_183` |
| Day in your life | `prof_186` |
| Weekend preferences | `prof_189` |
| How friends describe you | `prof_190` |
| Organizations involvement | `prof_191` |
| Personal growth | `prof_192` |
| What you notice in a person | `prof_193` |
| Relationship history overview | `prof_195` |
| Children details | `prof_196` |
| Matchmaker Notes (PRIVATE) | `prof_235` |

### Social Media

| Title | Field ID | Type |
|-------|----------|------|
| Instagram Handle | `prof_176` | Short Text |
| TikTok Handle | `prof_177` | Short Text |
| LinkedIn | `prof_178` | Short Text |
| Referral/invite code | `prof_175` | Short Text |

### Select Fields (single choice — send integer ID)

| Title | Field ID | Values |
|-------|----------|--------|
| Gender | `prof_132` | TODO: get values |
| Sexual Orientation | `prof_172` | TODO: get values |
| **Faith/Religion** | `prof_144` | `5`: Buddhist, `2`: Catholic, `30`: Chinese Traditional, `25`: Christian, `26`: East Asian, `27`: Eastern Orthodox, `9`: Hindu, `28`: Indigenous, **`4`: Jewish**, `3`: Muslim, `29`: Non-religious, `20`: Protestant, `31`: Sikh, `22`: Spiritual, `19`: Other |
| **Ethnicity** | `prof_133` | `4`: Asian, `11`: Black, `10`: Caucasian, `8`: East Indian, `12`: Hispanic/Latino, `9`: Indian American, `5`: Middle Eastern, `13`: Multiracial, `6`: Pacific Islander, `14`: Other, `15`: No Preference |
| **Relationship Status** | `prof_142` | `1`: Single (Green), `2`: It's Complicated (Yellow), `3`: Taken (Red), `4`: Here for Friends (Blue) |
| Income | `prof_158` | TODO: get values |
| Hair Color | `prof_136` | TODO: get values |
| Eye Color | `prof_169` | TODO: get values |
| Political Affiliation | `prof_165` | TODO: get values |
| Do you smoke? | `prof_23` | TODO: get values |
| Do you drink alcohol? | `prof_24` | TODO: get values |
| Do you have pets? | `prof_50` | TODO: get values |
| **Do you have children?** | `prof_174` | `1`: No, `2`: Yes not living in same house/not impacting day to day life, `3`: Yes shared custody, `4`: Yes dependent(s) living in the same house |
| **Do you want (more) children?** | `prof_19` | `1`: Yes, `2`: No, `3`: Undecided/Open |
| **Would you date long-distance?** | `prof_188` | `1`: Yes, `2`: No, `3`: Maybe |
| Education Level | `prof_167` | TODO: get values |

### MultiSelect Fields (send integer IDs — repeat field for multiple values)

| Title | Field ID | Values |
|-------|----------|--------|
| **Jewish Observance** | `prof_187` | `1`: Conservative, `2`: Reform, `3`: Modern Orthodox, `4`: Traditional, `5`: Spiritual but not Religious |
| **Membership Type** | `prof_197` | `5`: Join the Waitlist \| Get Invited to Events, `2`: Membership \| Initiation + Quarterly Fee & All Access, `6`: VIP Matchmaking \| High Ticket Clients, `7`: Allenby Single Submission \| $250 One Time Fee |
| Nationality | `prof_181` | TODO: get values |
| Top 3 values | `prof_234` | TODO: get values |
| How did you hear about us? | `prof_162` | TODO: get values |
| Interests (top 6) | `prof_185` | TODO: get values |
| Current Relationship Status | `prof_194` | TODO: get values |
| Close Friends story consent | `prof_230` | TODO: get values |
| Looking for a partner? | `prof_236` | TODO: get values |

---

## Preference Fields (pref_*)

| Title | Field ID | Type |
|-------|----------|------|
| Seeking partner who is | `pref_36` | Select |
| Preferred Sexual Orientation | `pref_41` | Select |
| Age range to date | `pref_1` | Range (start/end) |
| Relationship status preference | `pref_25` | Select |
| Ethnicity preference | `pref_26` | Select |
| Religion preference | `pref_27` | Select |
| Education preference | `pref_28` | Select |
| Income preference | `pref_43` | Select |
| Height range | `pref_47` | Height (ft & in) |
| Hair color preference | `pref_48` | Select |
| Eye color preference | `pref_49` | Select |
| Political affiliation preference | `pref_35` | Select |
| Smoking preference | `pref_33` | Select |
| Drinking preference | `pref_34` | Select |
| Children preference | `pref_50` | MultiSelect |
| Open to relocating | `pref_51` | MultiSelect |
| Top 5 partner values | `pref_84` | MultiSelect |
| Partner interests | `pref_52` | MultiSelect |
| Partner personality description | `pref_23` | Long Text |
| Physical characteristics | `pref_19` | Long Text |

---

## Field Mapping: Voice Agent → SMA

Maps the voice agent's `extractedData` keys (from intake calls) to SMA profile field IDs.

| Agent Field (extractedData) | SMA Field | Type | Notes |
|-----------------------------|-----------|------|-------|
| `firstName` | `prof_239` | Short Text | |
| `lastName` | `prof_241` | Short Text | |
| `age` | `prof_233` | Short Text | or `prof_131` as birthday |
| `location` | `prof_244` | Location | uses sub-fields: `_country`, `_city`, etc. |
| `ethnicity` | `prof_133` | Select | needs ID mapping |
| `occupation` | `prof_163` | Short Text | |
| `familyInfo` | `prof_182` | Long Text | upbringing & family values |
| `jewishObservance` | `prof_187` | MultiSelect | needs ID mapping |
| `kosherLevel` | — | — | **No direct SMA field** — store in matchmaker notes (`prof_235`) |
| `shabbatObservance` | — | — | **No direct SMA field** — store in matchmaker notes (`prof_235`) |
| `relationshipHistory` | `prof_195` | Long Text | |
| `lookingFor` | `pref_23` | Long Text (pref) | partner personality description |
| `physicalPreferences` | `pref_19` | Long Text (pref) | physical characteristics |
| `ageRangePreference` | `pref_1` | Range | `pref_1_start` / `pref_1_end` (parse "25-35" → start=25, end=35) |
| `mustHaves` | `pref_23` | Long Text (pref) | append to partner description, set `pref_23_field_weight=3` |
| `dealbreakers` | `pref_23` | Long Text (pref) | append to partner description with "Dealbreakers:" prefix |
| `marriageTimeline` | — | — | **No direct SMA field** — store in matchmaker notes (`prof_235`) |
| `kidsPreference` | `prof_19` | Select | needs ID mapping (1=Yes, 2=No, 3=Undecided) |
| `dayInLife` | `prof_186` | Long Text | |
| `hobbies` | `prof_185` | MultiSelect | or append to `prof_186` as text |
| `additionalNotes` | `prof_235` | Long Text | matchmaker notes |
| `hometown` | `prof_244` | Location | or mention in `prof_182` |
| `willingToRelocate` | `pref_51` | MultiSelect (pref) | needs ID mapping |

---

## Error Codes (all endpoints)

| Code | Meaning | Common Errors |
|------|---------|---------------|
| 400 | Bad Request | Invalid filters, field names, email, date format |
| 401 | Unauthorized | Missing/invalid token, token disabled, Agency API disabled |
| 404 | Not Found | Client not found, resource not found |
| 405 | Method Not Allowed | Wrong HTTP method |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Internal server error |

---

## Webhooks

SMA can push events to our endpoints via webhooks. Configured in the API Addon section of the SMA admin panel.

**Setup:**
1. Add webhook URL in SMA admin (up to 10 active webhooks)
2. SMA sends a `verification` event with a `challenge` string
3. Respond with `{"challenge": "<code>"}` and status 200
4. Select which events to receive

**Supported events:**

| Event | Trigger |
|-------|---------|
| `client_created` | New client created |
| `client_updated` | Client shell record updated |
| `client_deleted` | Client deleted |
| `client_profile_updated` | Profile fields changed |
| `client_preferences_updated` | Preference fields changed |
| `match_added` | New match created |
| `match_updated` | Match status changed |
| `match_deleted` | Match deleted |
| `match_group_changed` | Match group changed |
| `verification` | Initial webhook validation |

**Payload examples:**
```json
// client_profile_updated — includes changed fields only
{ "event": "client_profile_updated", "payload": { "id": 1, "prof_1": "1992-08-12" } }

// match_added
{
  "event": "match_added",
  "payload": {
    "id": 482,
    "client": { "id": 2 },
    "match": { "id": 1 },
    "group": { "id": 1, "name": "Group 1" }
  }
}

// match_updated
{
  "event": "match_updated",
  "payload": {
    "id": 482,
    "status": { "id": 3, "name": "Prepared for date" }
  }
}
```

**Security — signature verification:**
- Headers: `X-Signature` (HMAC SHA-256) and `X-Timestamp`
- Message: `{timestamp}.{payload_json}`
- Key: webhook secret (generated when webhook is created)

```python
import hmac, hashlib

def verify_webhook_signature(payload, received_signature, received_timestamp, webhook_secret):
    message = f'{received_timestamp}.{payload}'
    computed = hmac.new(webhook_secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, received_signature)
```

**Retry policy:** 5 retries at 4m, 16m, 64m, 256m, 1024m intervals. Auto-deactivates if >40% fail in 24h.

**Important:** Respond with status 200 immediately, before any heavy processing.

---

## Endpoints Documented

- [x] List All Clients (`GET /api3/clients/`)
- [x] Create a New Client (`POST /api3/clients/`)
- [x] Retrieve Client Details (`GET /api3/clients/<id>/`)
- [x] Retrieve Client Profile (`GET /api3/clients/<id>/profile/`)
- [x] Update Client Profile (`PUT /api3/clients/<id>/profile/`)
- [x] Update Client Preferences (`PUT /api3/clients/<id>/preferences/`)
- [x] Retrieve Client Preferences (`GET /api3/clients/<id>/preferences/`)
- [x] Webhooks (push events from SMA)
- [x] Retrieve Client Matches (`GET /api3/clients/<id>/matches/`)
- [x] Retrieve Client Match Details (`GET /api3/clients/<id>/matches/<match_id>/`)
- [x] Update a Client Match (`PUT /api3/clients/<id>/matches/<match_id>/`)
- [x] Retrieve Client Suggestions (`GET /api3/clients/<id>/suggestions/`)

### 9. Retrieve Client Matches

```
GET /api3/clients/<client_id>/matches/
```

Returns paginated list of matches for a client. Rate limit: **5 requests / 10 seconds**.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `group_id` | int | Filter by match group |
| `count` | int | Results per page (default: 20) |
| `offset` | int | Pagination offset |

**Response:**
```json
{
  "objects": [
    {
      "id": 101,
      "created_date": "2024-01-01T12:00:00Z",
      "user": { "id": 1, "first_name": "John" },
      "client_priority": null,
      "match_priority": null,
      "client_due_date": "2024-02-01",
      "match_due_date": null,
      "group": { "id": 5, "name": "Group 2" },
      "status": { "id": 1, "name": "In Progress" },
      "client_status": {},
      "match_status": {},
      "client": { "id": 1 },
      "match": { "id": 301 }
    }
  ],
  "count": 20,
  "offset": 0,
  "total_count": 34
}
```

**Key fields:**
- `client.id` / `match.id` — the two SMA client IDs in the match
- `status` — match status (with ID and name)
- `client_status` / `match_status` — per-side status
- `group` — match group (used for organizing match stages)

---

### 10. Retrieve Client Match Details

```
GET /api3/clients/<client_id>/matches/<match_id>/
```

Returns details for a specific match, including match percentages.

**Response:**
```json
{
  "id": 1,
  "created_date": "2023-03-09T19:06:32.072Z",
  "user": {},
  "client_priority": 7,
  "match_priority": null,
  "client_due_date": "2023-04-04",
  "match_due_date": null,
  "client_percent": 43,
  "match_percent": 0,
  "group": { "id": 5, "name": "Group 2" },
  "status": { "id": 3, "name": "Prepped for date" },
  "client_status": { "id": 1, "name": "Ready" },
  "match_status": {},
  "client": { "id": 3 },
  "match": { "id": 554 }
}
```

---

### 11. Update a Client Match

```
PUT /api3/clients/<client_id>/matches/<match_id>/
```

Update match priorities, due dates, group, and status. Returns `HTTP 204`.

**Form fields:**

| Field | Description |
|-------|-------------|
| `group` | Group ID |
| `client_priority` | Priority for the client |
| `match_priority` | Priority for the match partner |
| `client_due_date` | Due date for client (YYYY-MM-DD) |
| `match_due_date` | Due date for match partner |
| `status` | Match status ID |
| `client_status` | Client-side status ID |
| `match_status` | Match-side status ID |

---

### 12. Retrieve Client Suggestions

```
GET /api3/clients/<client_id>/suggestions/
```

Returns AI-generated match suggestions with compatibility percentages. Rate limit: **5 requests / 10 seconds**.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `count` | int | Results per page (default: 20) |
| `offset` | int | Pagination offset |

**Response:**
```json
{
  "objects": [
    {
      "matched_client_id": 248,
      "client_percent": 100,
      "match_percent": 100,
      "percent": 100
    },
    {
      "matched_client_id": 248,
      "client_percent": 100,
      "match_percent": 91,
      "percent": 95
    }
  ],
  "count": 20,
  "offset": 0,
  "total_count": 2
}
```

**Key fields:**
- `matched_client_id` — the suggested SMA client ID
- `client_percent` — how well this matches the client's preferences
- `match_percent` — how well the client matches the suggestion's preferences
- `percent` — overall compatibility score

---

## Endpoints Still Needed

- [ ] Update Client Details (`PUT /api3/clients/<id>/`)
- [ ] Create a New Client Match (`POST /api3/clients/<id>/matches/`)
- [ ] Delete a Client Match (`DELETE /api3/clients/<id>/matches/<match_id>/`)
