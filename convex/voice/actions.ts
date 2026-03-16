// @ts-nocheck
"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MODEL,
  getOpenRouterApiKey,
} from "../integrations/openrouter/config";
import { fetchAndMapClient, extractValue } from "../integrations/smartmatchapp/contacts";
import {
  getClientProfile,
  getClientPreferences,
  getClientDetails,
  updateClientProfile,
  updateClientPreferences,
  listClientFiles,
  uploadClientFile,
  downloadClientFile,
  deleteClientFile,
} from "../integrations/smartmatchapp/client";

// ── Preference field map (SMA pref IDs → human-readable keys) ────────

const PREF_FIELD_MAP: Record<string, string> = {
  pref_36: "seekingPartner",
  pref_41: "sexualOrientationPref",
  pref_1: "ageRange",
  pref_25: "relationshipStatusPref",
  pref_26: "ethnicityPref",
  pref_27: "religionPref",
  pref_28: "educationPref",
  pref_43: "incomePref",
  pref_47: "heightRange",
  pref_48: "hairColorPref",
  pref_49: "eyeColorPref",
  pref_35: "politicalPref",
  pref_33: "smokingPref",
  pref_34: "drinkingPref",
  pref_50: "childrenPref",
  pref_51: "willingToRelocate",
  pref_84: "partnerValues",
  pref_52: "partnerInterests",
  pref_23: "partnerPersonality",
  pref_19: "physicalCharacteristics",
};

// ── Generate Summary ─────────────────────────────────────────────────

/**
 * Generate an AI summary from a call transcript.
 * Called internally after a call ends.
 */
export const generateSummary = internalAction({
  args: {
    callId: v.id("phoneCalls"),
  },
  handler: async (ctx, args) => {
    console.log("[generateSummary] Starting for call:", args.callId);
    // Fetch the call record
    const call = await ctx.runQuery(internal.voice.queries.getCallInternal, {
      callId: args.callId,
    });
    if (!call || !call.transcript) {
      console.log("[generateSummary] No call or transcript found — skipping");
      return;
    }
    console.log("[generateSummary] Call found: memberId=%s sandbox=%s segments=%d",
      call.memberId, call.sandbox, Array.isArray(call.transcript) ? call.transcript.length : "string");

    const transcript =
      typeof call.transcript === "string"
        ? call.transcript
        : call.transcript
            .map(
              (seg: { speaker: string; text: string }) =>
                `${seg.speaker === "agent" ? "Matcha" : "Caller"}: ${seg.text}`
            )
            .join("\n");

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenRouterApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: `You are an expert data extraction engine analyzing a phone intake call transcript for Club Allenby, a Jewish matchmaking service.

Your job is to extract profile data that was ACTUALLY SAID in the conversation. Only extract information the caller explicitly stated or clearly implied through their own words. Do NOT fabricate, guess, or assume any data that is not supported by the transcript. If the call was very short or the caller said very little, return very few or no extracted fields — that is correct behavior.

## Output format
Return a single flat JSON object with these top-level keys:
- "summary": 2-3 sentence summary of the call
- "extractedFields": FLAT object (NO nesting, NO categories) with the field keys below
- "profileCompleteness": 0-100 percentage based on how many fields were filled
- "recommendedNextSteps": array of 1-3 follow-up actions
- "sentiment": "positive" | "neutral" | "negative"
- "flags": array of concerns (e.g. "pricing_question", "hostile", "confused")

## INFERENCE RULES — only apply when the caller ACTUALLY SAID something relevant
These are examples of how to map what callers say to fields. Only use these when the caller's words support the inference:

- "I'm looking for a woman" → prefSeeking="female", sexualOrientation="straight"
- "I'm 28" → age="28"
- "I work in finance at Goldman Sachs" → occupation="finance", careerOverview="Works at Goldman Sachs in finance"
- "I went to Penn" → collegeDetails="University of Pennsylvania", educationLevel="Bachelors"
- "my ex-girlfriend" → can infer sexualOrientation from gender of ex
- "I keep kosher at home but eat out anywhere" → kosherLevel="kosher in the house"
- "I'm originally from Israel but live in Miami now" → nationality="Israeli", hometown="Israel", location="Miami, FL"
- "I drink socially" → drinkAlcohol="yes socially"

CRITICAL: If the caller did NOT say anything related to a field, do NOT include it. An empty extractedFields object is valid for short or incomplete calls.

## All extractable fields (use these EXACT keys)

### PROFILE — About the caller
| Key | Format/Type | Examples |
|-----|-------------|---------|
| firstName | text | "David" |
| lastName | text | "Cohen" |
| age | number as string | "28" |
| birthdate | YYYY-MM-DD | "1997-03-15" |
| gender | male/female/non-binary | "male" |
| sexualOrientation | straight/gay/lesbian/bisexual/other | "straight" |
| relationshipStatus | single/divorced/widowed/separated/complicated | "single" |
| ethnicity | text | "Ashkenazi", "Sephardic", "Persian", "Mixed" |
| height | ft'in format | "5'10", "6'1" |
| hairColor | text | "brown", "blonde", "black" |
| eyeColor | text | "brown", "blue", "green", "hazel" |
| languages | text | "English, Hebrew" |
| politicalAffiliation | conservative/liberal/middle of the road/independent/not political | "liberal" |
| smoke | no/yes socially/yes regularly | "no" |
| drinkAlcohol | no/yes socially/yes regularly | "yes socially" |
| hasPets | no/dog/cat/both/other | "dog" |
| longDistance | yes/no/maybe | "no" |
| location | city, state | "Miami, FL" |
| hometown | text | "New York" |
| nationality | text | "American", "Israeli", "Canadian" |
| willingToRelocate | yes/no/maybe | "maybe" |
| occupation | text | "software engineer" |
| careerOverview | text, 1-3 sentences | "Works in private equity at a mid-size firm" |
| income | range | "under $50k", "$50k-$100k", "$100k-$150k", "$150k-$250k", "$250k-$500k", "$500k+" |
| educationLevel | level | "high school", "some college", "bachelors", "graduate", "J.D./M.D./PhD" |
| collegeDetails | text | "NYU, studied business" |
| religion | text | "Jewish", "Christian", "Muslim" |
| jewishObservance | text | "Reform", "Conservative", "Modern Orthodox", "Orthodox", "secular", "just Jewish", "Conservadox", "Traditional" |
| kosherLevel | text | "not kosher", "kosher-style", "kosher meat only", "kosher in the house", "fully kosher" |
| shabbatObservance | text | "yes fully", "Friday night dinners", "not really", "sometimes" |
| topValues | comma-separated | "family, trust, honesty" |
| upbringing | text, 1-3 sentences | "Grew up in a close Orthodox family, parents still married" |
| familyInfo | text | "Has 2 siblings, very close with parents, parents divorced" |
| dayInLife | text, 2-4 sentences | "Gym in the morning, works in finance, goes out with friends at night" |
| weekendPreferences | text | "Shabbat dinner Friday, brunch Saturday, hiking Sunday" |
| hobbies | comma-separated | "gym, hiking, cooking, travel" |
| interests | comma-separated | "fitness, dining out, travel, music" |
| friendsDescribe | text | "funny, loyal, outgoing" |
| organizations | text | "Young Jewish Professionals, local synagogue" |
| personalGrowth | text | "Been in therapy, reads self-help books" |
| whatYouNotice | text | "eyes, smile, how they treat the waiter" |
| relationshipHistory | text, 2-4 sentences | "One 3-year relationship that ended 6 months ago. Learned he needs better communication." |
| hasChildren | no/yes/shared custody/dependent | "no" |
| childrenDetails | text | "2 kids, ages 5 and 8, shared custody" |
| kidsPreference | yes/no/undecided | "yes" |
| marriageTimeline | text | "within 2-3 years" |
| instagram | handle | "@davidcohen" |
| additionalNotes | text | any other relevant info |
| membershipInterest | "member" or "vip" or null | Set to "member" if caller expressed interest in Membership, "vip" if interested in VIP Matchmaking. Only set if clearly expressed. |

### PREFERENCES — What they want in a PARTNER
| Key | Format/Type | Examples |
|-----|-------------|---------|
| lookingFor | text, 2-4 sentences | "Someone family-oriented, Jewish, funny, who wants kids" |
| physicalPreferences | text | "Athletic build, dark hair, not too tall" |
| ageRangePreference | range | "25-32" |
| mustHaves | text | "Must be Jewish, want kids, close to family" |
| dealbreakers | text | "Long distance, smoking, not wanting kids" |
| prefSeeking | male/female/non-binary | "female" |
| prefSexualOrientation | straight/gay/lesbian/bisexual/other | "straight" |
| prefRelationshipStatus | single/divorced/any | "single" |
| prefEthnicity | text | "Ashkenazi, Sephardic" or "no preference" |
| prefReligion | text | "Jewish" |
| prefEducation | text | "bachelors or higher" |
| prefIncome | text | "doesn't matter" or "$100k+" |
| prefHeightRange | range in ft'in | "5'2-5'8" |
| prefHairColor | text | "no preference" or "brunette" |
| prefEyeColor | text | "no preference" or "blue, green" |
| prefPolitical | text | "similar to mine" or "liberal" |
| prefSmoking | no/yes socially/yes regularly | "no" |
| prefDrinking | no/yes socially/yes regularly | "yes socially" |
| prefChildren | text | "no" or "open to it" |
| prefRelocating | yes/no/maybe | "no" |
| prefPartnerValues | comma-separated | "family, loyalty, humor, faith" |
| prefPartnerInterests | comma-separated | "travel, fitness, cooking" |

## IMPORTANT RULES
1. Return a FLAT JSON object — no nesting, no categories, no grouping
2. Only include fields the caller ACTUALLY discussed — do NOT include "N/A", "unknown", null, or empty strings
3. Use the EXACT key names from the tables above
4. For select fields, use the exact format shown in the examples
5. Do NOT fabricate or hallucinate data. If the transcript is short or the caller barely spoke, return few or no fields. An empty extractedFields object is correct for calls with no substantive content.
6. If the caller describes their ideal partner in detail, break it apart into multiple pref fields
7. Combine all relevant mentions — if they mention hobbies in 3 different places, merge them into one hobbies field
8. For comma-separated fields (hobbies, interests, topValues, etc.), combine all mentions into one value

Respond with ONLY valid JSON. No markdown, no code fences, no explanation.`,
          },
          {
            role: "user",
            content: `Transcript:\n\n${transcript}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("[generateSummary] LLM API failed:", response.status, response.statusText);
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log("[generateSummary] LLM response received (%d chars)", content?.length || 0);

    let summary;
    try {
      summary = JSON.parse(content);
      console.log("[generateSummary] Parsed summary — completeness=%s%%, sentiment=%s, extractedFields=%s",
        summary.profileCompleteness, summary.sentiment, Object.keys(summary.extractedFields || {}).join(", "));
    } catch {
      summary = { summary: content, raw: true };
      console.warn("[generateSummary] Failed to parse LLM JSON — using raw");
    }

    // Gap #1: Merge AI-extracted data with existing agent-saved data (agent wins)
    const existing = (call.extractedData as Record<string, unknown>) ?? {};
    const rawAiFields = (summary.extractedFields as Record<string, unknown>) ?? {};
    // Flatten nested objects (LLM sometimes groups by category like { BASIC: {...}, LOCATION: {...} })
    const isNA = (v: unknown) => v == null || v === "" || String(v).toLowerCase() === "n/a";
    const aiFields: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawAiFields)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        // Nested object — spread its contents into the flat map
        for (const [innerKey, innerVal] of Object.entries(val as Record<string, unknown>)) {
          if (!isNA(innerVal)) aiFields[innerKey] = innerVal;
        }
      } else {
        if (!isNA(val)) aiFields[key] = val;
      }
    }
    const merged = { ...aiFields, ...existing };
    console.log("[generateSummary] Merging data — agent-saved: %d fields, AI-extracted: %d fields, merged: %d fields",
      Object.keys(existing).length, Object.keys(aiFields).length, Object.keys(merged).length);

    // Gap #2: Determine profileAction
    let profileAction: "updated" | "created" | "none" = "none";
    if (call.memberId) {
      profileAction = "updated";
    } else if (merged.firstName) {
      profileAction = "created";
    }

    // Save summary, merged data, and profileAction to the call record
    await ctx.runMutation(internal.voice.mutations.updateCall, {
      callId: args.callId,
      status: "completed",
      aiSummary: summary,
      extractedData: Object.keys(merged).length > 0 ? merged : undefined,
      profileAction,
    });

    // Gap #6: Update member profile with voice call data
    if (call.memberId) {
      const dateStr = new Date().toISOString().split("T")[0];
      const prefix = call.sandbox ? "[SANDBOX] " : "";
      const notes = `${prefix}[Voice Call ${dateStr}] ${summary.summary ?? "Call completed."}`;
      const profileComplete = typeof summary.profileCompleteness === "number"
        && summary.profileCompleteness > 70;

      await ctx.runMutation(internal.voice.mutations.updateMemberFromCall, {
        memberId: call.memberId,
        matchmakerNotes: notes,
        profileComplete: profileComplete || undefined,
      });
    }

    // Auto-flag quality issues
    const flags: string[] = [];
    if (call.duration && call.duration < 120) flags.push("short_call");
    if (call.status === "transferred") flags.push("transferred");
    if (summary.flags?.length > 0) flags.push(...summary.flags);

    if (flags.length > 0) {
      await ctx.runMutation(internal.voice.mutations.updateCall, {
        callId: args.callId,
        status: "completed",
        qualityFlags: flags,
      });
    }

    // Check for membership interest and create a lead if found
    const rawMembershipInterest = (merged.membershipInterest as string | undefined)?.toLowerCase().trim();
    const membershipInterest = rawMembershipInterest === "member" || rawMembershipInterest === "vip"
      ? rawMembershipInterest : undefined;
    if (membershipInterest) {
      const prospectName = [merged.firstName, merged.lastName]
        .filter(Boolean)
        .join(" ") || "Unknown caller";

      console.log("[generateSummary] Membership interest detected: %s for %s", membershipInterest, prospectName);
      await ctx.runMutation(internal.membershipLeads.mutations.createFromCall, {
        memberId: call.memberId || undefined,
        callId: args.callId,
        tierInterest: membershipInterest,
        prospectName,
        prospectPhone: call.phone || undefined,
      });
    }

    // Schedule SMA sync after all data is merged and saved
    console.log("[generateSummary] Done — scheduling syncCallToSMA");
    await ctx.scheduler.runAfter(0, internal.voice.actions.syncCallToSMA, {
      callId: args.callId,
    });
  },
});

// ── Fetch SMA Profile ────────────────────────────────────────────────

/**
 * Fetch a member's full SMA profile and preferences, store in profileData.
 */
export const fetchSmaProfile = internalAction({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    console.log("[fetchSmaProfile] Starting for member:", args.memberId);
    const member = await ctx.runQuery(internal.members.queries.getInternal, {
      memberId: args.memberId,
    });
    if (!member?.smaId || !/^\d+$/.test(member.smaId)) {
      console.log("[fetchSmaProfile] Skipping — no numeric smaId:", member?.smaId);
      return null;
    }

    const smaClientId = parseInt(member.smaId, 10);
    console.log("[fetchSmaProfile] Fetching SMA client %d (%s)", smaClientId, member.firstName);

    // Fetch client details, profile, and preferences from SMA in parallel
    const [clientDetails, profile, prefGroups] = await Promise.all([
      getClientDetails(smaClientId).catch((e: any) => {
        console.warn("[fetchSmaProfile] Client details fetch failed (non-fatal):", e.message);
        return null;
      }),
      fetchAndMapClient(smaClientId),
      getClientPreferences(smaClientId),
    ]);
    console.log("[fetchSmaProfile] Got details=%s, profile (%d fields), %d pref groups",
      clientDetails ? "yes" : "no",
      Object.keys(profile.smaProfile || {}).length, prefGroups.length);

    // Flatten preferences using extractValue
    const prefData: Record<string, any> = {};
    for (const group of prefGroups) {
      if (group.fields) {
        for (const [fieldId, field] of Object.entries(group.fields)) {
          const key = PREF_FIELD_MAP[fieldId];
          if (key) {
            const val = extractValue(field);
            if (val != null && val !== "") {
              prefData[key] = val;
            }
          }
        }
      }
    }

    // Update member's profileData (profile + prefs merged)
    const combinedForStorage = { ...profile.smaProfile, preferences: prefData };
    await ctx.runMutation(internal.voice.mutations.updateMemberProfileData, {
      memberId: args.memberId,
      profileData: combinedForStorage,
    });

    console.log("[fetchSmaProfile] Done — %d profile fields, %d preference fields",
      Object.keys(profile.smaProfile || {}).length, Object.keys(prefData).length);

    // Return with named keys so Python agent can unpack them
    return {
      smaProfile: profile.smaProfile,
      smaPreferences: prefData,
      clientDetails: clientDetails ? {
        id: clientDetails.id,
        isArchived: clientDetails.is_archived,
        isSubmitted: clientDetails.is_submitted,
        created: clientDetails.created,
        assignedUsers: clientDetails.assigned_users,
      } : null,
    };
  },
});

// ── Sync Call to SMA ─────────────────────────────────────────────────

// Text profile fields: extractedData key → SMA field ID
const TEXT_PROFILE_MAP: Record<string, string> = {
  firstName: "prof_239",
  lastName: "prof_241",
  age: "prof_233",
  occupation: "prof_163",
  careerOverview: "prof_184",
  languages: "prof_161",
  collegeDetails: "prof_183",
  dayInLife: "prof_186",
  weekendPreferences: "prof_189",
  friendsDescribe: "prof_190",
  organizations: "prof_191",
  personalGrowth: "prof_192",
  whatYouNotice: "prof_193",
  relationshipHistory: "prof_195",
  childrenDetails: "prof_196",
  instagram: "prof_176",
  tiktok: "prof_177",
  linkedin: "prof_178",
};

// Select fields that need LLM resolution
const SELECT_FIELD_MAP: Record<string, string> = {
  gender: "prof_132",
  ethnicity: "prof_133",
  income: "prof_158",
  religion: "prof_144",
  relationshipStatus: "prof_142",
  politicalAffiliation: "prof_165",
  hairColor: "prof_136",
  eyeColor: "prof_169",
  sexualOrientation: "prof_172",
  smoke: "prof_23",
  drinkAlcohol: "prof_24",
  hasPets: "prof_50",
  educationLevel: "prof_167",
};

// Multiselect fields that need LLM resolution
const MULTISELECT_FIELD_MAP: Record<string, string> = {
  jewishObservance: "prof_187",
  topValues: "prof_234",
  nationality: "prof_181",
};

// ── Preference field maps (extractedData key → SMA pref ID) ──────────

// Select preference fields that need LLM resolution
const SELECT_PREF_MAP: Record<string, string> = {
  prefSeeking: "pref_36",           // Seeking gender: 1=Female, 2=Male, 3=Non-binary
  prefSexualOrientation: "pref_41", // 1=Straight, 2=Gay, 3=Lesbian, 4=Bisexual, 5=Other
  prefRelationshipStatus: "pref_25",// 1=Single, 2=It's Complicated, 3=Taken, 4=Here for Friends
  prefEthnicity: "pref_26",         // 4=Asian, 10=Caucasian, 5=Middle Eastern, etc.
  prefReligion: "pref_27",          // 4=Jewish, 25=Christian, 3=Muslim, etc.
  prefEducation: "pref_28",         // 1=High School, 4=Bachelors, 5=Graduate, 6=J.D./M.D./PhD
  prefIncome: "pref_43",            // 1=<$50k, 4=$50-100k, 3=$100-150k, etc.
  prefHairColor: "pref_48",         // 1=Black, 2=Blonde, 3=Brown, 4=Red, 11=No Preference
  prefEyeColor: "pref_49",          // 1=Brown, 2=Blue, 3=Green, 4=Hazel, 6=No Preference
  prefPolitical: "pref_35",         // 1=Conservative, 2=Liberal, 3=Middle, 4=Independent
  prefSmoking: "pref_33",           // 2=Yes socially, 3=Yes regularly, 5=No
  prefDrinking: "pref_34",          // 2=Yes socially, 3=Yes regularly, 1=No
};

// MultiSelect preference fields that need LLM resolution
const MULTISELECT_PREF_MAP: Record<string, string> = {
  prefChildren: "pref_50",          // 1=No, 2=Yes not impacting, 3=Shared custody, 4=Dependent
  prefRelocating: "pref_51",        // 1=Yes, 2=No, 3=Maybe
  prefPartnerValues: "pref_84",     // 1=Trust, 2=Respect, 3=Communication, ... (top 5)
  prefPartnerInterests: "pref_52",  // 1=Pickleball, 5=Dining Out, 8=Travel, 14=Hiking, ...
};

/**
 * Sync call data to SmartMatchApp after a call.
 */
export const syncCallToSMA = internalAction({
  args: {
    callId: v.id("phoneCalls"),
  },
  handler: async (ctx, args) => {
    console.log("[syncCallToSMA] Starting for call:", args.callId);

    // Check if auto-sync is enabled in settings
    const autoSync = await ctx.runQuery(internal.settings.getAutoSyncCallsToCrm);
    if (!autoSync) {
      console.log("[syncCallToSMA] Auto-sync disabled in settings — skipping");
      await ctx.runMutation(internal.voice.mutations.updateSmaSyncStatus, {
        callId: args.callId,
        status: "skipped",
      });
      return;
    }

    const call = await ctx.runQuery(internal.voice.queries.getCallInternal, {
      callId: args.callId,
    });
    if (!call) {
      console.log("[syncCallToSMA] Call not found — aborting");
      return;
    }

    if (!call.memberId || !call.extractedData) {
      console.log("[syncCallToSMA] Skipping — memberId=%s extractedData=%s",
        call.memberId, call.extractedData ? "present" : "null");
      await ctx.runMutation(internal.voice.mutations.updateSmaSyncStatus, {
        callId: args.callId,
        status: "skipped",
      });
      return;
    }

    console.log("[syncCallToSMA] Processing — memberId=%s extractedData keys: %s",
      call.memberId, Object.keys(call.extractedData as Record<string, any>).join(", "));

    await ctx.runMutation(internal.voice.mutations.updateSmaSyncStatus, {
      callId: args.callId,
      status: "pending",
    });

    const member = await ctx.runQuery(internal.members.queries.getInternal, {
      memberId: call.memberId,
    });
    if (!member?.smaId || !/^\d+$/.test(member.smaId)) {
      console.log("[syncCallToSMA] Skipping — member has no numeric smaId:", member?.smaId);
      await ctx.runMutation(internal.voice.mutations.updateSmaSyncStatus, {
        callId: args.callId,
        status: "skipped",
      });
      return;
    }

    const smaClientId = parseInt(member.smaId, 10);
    // Flatten nested objects + filter out N/A values before syncing
    const rawData = call.extractedData as Record<string, any>;
    const isNAOrEmpty = (v: unknown) => v == null || v === "" || String(v).toLowerCase() === "n/a";
    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawData)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        // Flatten nested category objects (e.g. { BASIC: { age: 25 } } → age: 25)
        for (const [innerKey, innerVal] of Object.entries(v as Record<string, unknown>)) {
          if (!isNAOrEmpty(innerVal)) data[innerKey] = innerVal;
        }
      } else if (!isNAOrEmpty(v)) {
        data[k] = v;
      }
    }
    console.log("[syncCallToSMA] SMA client ID: %d, member: %s, fields after flatten+filter: %d (%s)",
      smaClientId, member.firstName, Object.keys(data).length, Object.keys(data).join(", "));

    try {
      // ── Step 1: Fetch current SMA profile & preferences (to avoid overwriting) ──
      console.log("[syncCallToSMA] Fetching current SMA profile & preferences to check existing fields");
      const currentProfileGroups = await getClientProfile(smaClientId);
      const currentPrefGroups = await getClientPreferences(smaClientId);

      // Flatten current profile into { fieldId: fieldObj } for easy lookup
      const currentFields: Record<string, any> = {};
      for (const group of currentProfileGroups) {
        if (group.fields) {
          for (const [fieldId, field] of Object.entries(group.fields)) {
            currentFields[fieldId] = field;
          }
        }
      }

      // Flatten current preferences into { fieldId: fieldObj }
      const currentPrefFields: Record<string, any> = {};
      for (const group of currentPrefGroups) {
        if (group.fields) {
          for (const [fieldId, field] of Object.entries(group.fields)) {
            currentPrefFields[fieldId] = field;
          }
        }
      }

      // ── Step 2: Build profile fields ──
      const profileFields: Record<string, string> = {};

      // Text fields — direct mapping
      for (const [dataKey, smaField] of Object.entries(TEXT_PROFILE_MAP)) {
        if (data[dataKey] != null && data[dataKey] !== "") {
          profileFields[smaField] = String(data[dataKey]);
        }
      }

      // upbringing / familyInfo → prof_182
      if (data.upbringing || data.familyInfo) {
        profileFields.prof_182 = String(data.upbringing || data.familyInfo);
      }

      // Birthdate (date field)
      if (data.birthdate) {
        profileFields.prof_131 = String(data.birthdate);
      }

      // Height: convert "5'10" → mm
      if (data.height) {
        const heightMm = parseHeightToMm(data.height);
        if (heightMm) profileFields.prof_170 = String(heightMm);
      }

      // Location: parse into sub-fields
      if (data.location) {
        const loc = parseLocation(data.location);
        if (loc.country) profileFields.prof_244_country = loc.country;
        if (loc.city) profileFields.prof_244_city = loc.city;
        if (loc.state) profileFields.prof_244_state = loc.state;
        if (loc.zipCode) profileFields.prof_244_zip_code = loc.zipCode;
      }

      // Well-known select fields with fixed options
      if (data.hasChildren) {
        const childMap: Record<string, string> = { "no": "1", "yes": "2", "shared custody": "3", "dependent": "4" };
        const val = childMap[String(data.hasChildren).toLowerCase()] || "1";
        profileFields.prof_174 = val;
      }
      if (data.kidsPreference || data.wantChildren) {
        const val = String(data.kidsPreference || data.wantChildren).toLowerCase();
        const kidMap: Record<string, string> = { "yes": "1", "no": "2", "undecided": "3", "maybe": "3" };
        profileFields.prof_19 = kidMap[val] || "3";
      }
      if (data.longDistance) {
        const val = String(data.longDistance).toLowerCase();
        const ldMap: Record<string, string> = { "yes": "1", "no": "2", "maybe": "3" };
        profileFields.prof_188 = ldMap[val] || "3";
      }

      // Select/multiselect fields that need LLM resolution
      const selectFields: Array<{ dataKey: string; smaField: string; value: string }> = [];
      for (const [dataKey, smaField] of Object.entries({ ...SELECT_FIELD_MAP, ...MULTISELECT_FIELD_MAP })) {
        if (data[dataKey] != null && data[dataKey] !== "") {
          selectFields.push({ dataKey, smaField, value: String(data[dataKey]) });
        }
      }
      // Resolve select fields via LLM (batch all at once)
      if (selectFields.length > 0) {
        const resolvePrompt = buildSelectResolvePrompt(selectFields, currentFields);
        if (resolvePrompt) {
          const resolved = await resolveSelectFieldsViaLLM(resolvePrompt);
          console.log("[syncCallToSMA] LLM resolved %d select fields", Object.keys(resolved).length);
          for (const [smaField, choiceId] of Object.entries(resolved)) {
            profileFields[smaField] = choiceId;
          }
        }
      }

      // Interests/hobbies — append to dayInLife
      if (data.interests || data.hobbies) {
        const existing = profileFields.prof_186 || "";
        const hobbies = data.interests || data.hobbies;
        profileFields.prof_186 = existing ? `${existing}\n\nInterests: ${hobbies}` : String(hobbies);
      }

      // ── Step 3: Log profile fields that will overwrite existing SMA values ──
      // We now ALWAYS sync new data from the call — even if SMA already has values.
      // The voice agent collects the latest info directly from the member, so it
      // should take priority over stale SMA data.
      const locationSubFields = ["prof_244_country", "prof_244_city", "prof_244_state", "prof_244_zip_code"];
      const overwrittenProfile: string[] = [];
      for (const smaField of Object.keys(profileFields)) {
        if (locationSubFields.includes(smaField)) continue;
        if (isSmaFieldFilled(currentFields[smaField])) {
          overwrittenProfile.push(smaField);
        }
      }
      if (overwrittenProfile.length > 0) {
        console.log("[syncCallToSMA] Overwriting %d profile fields with new data from call: %s",
          overwrittenProfile.length, overwrittenProfile.join(", "));
      }

      // ── Step 4: Build preference fields ──
      const prefFields: Record<string, string> = {};

      // Partner personality: lookingFor + mustHaves + dealbreakers
      const personalityParts: string[] = [];
      if (data.lookingFor) personalityParts.push(String(data.lookingFor));
      if (data.mustHaves) personalityParts.push(`Must-haves: ${data.mustHaves}`);
      if (data.dealbreakers) personalityParts.push(`Dealbreakers: ${data.dealbreakers}`);
      if (personalityParts.length > 0) {
        prefFields.pref_23 = personalityParts.join("\n\n");
        prefFields.pref_23_field_weight = "3";
      }

      // Physical preferences
      if (data.physicalPreferences) {
        prefFields.pref_19 = String(data.physicalPreferences);
      }

      // Age range preference
      if (data.ageRangePreference) {
        const range = parseAgeRange(data.ageRangePreference);
        if (range) {
          prefFields.pref_1_start = String(range.start);
          prefFields.pref_1_end = String(range.end);
        }
      }

      // Height range preference (pref_47)
      if (data.prefHeightRange) {
        const hRange = parseHeightRange(data.prefHeightRange);
        if (hRange) {
          prefFields.pref_47_start = String(hRange.start);
          prefFields.pref_47_end = String(hRange.end);
        }
      }

      // Select/MultiSelect preference fields — resolve via LLM (same pattern as profile)
      const selectPrefFields: Array<{ dataKey: string; smaField: string; value: string }> = [];
      for (const [dataKey, smaField] of Object.entries({ ...SELECT_PREF_MAP, ...MULTISELECT_PREF_MAP })) {
        if (data[dataKey] != null && data[dataKey] !== "") {
          selectPrefFields.push({ dataKey, smaField, value: String(data[dataKey]) });
        }
      }

      if (selectPrefFields.length > 0) {
        const resolvePrompt = buildSelectResolvePrompt(selectPrefFields, currentPrefFields);
        if (resolvePrompt) {
          const resolved = await resolveSelectFieldsViaLLM(resolvePrompt);
          for (const [smaField, choiceId] of Object.entries(resolved)) {
            prefFields[smaField] = choiceId;
          }
          console.log("[syncCallToSMA] Resolved %d preference select fields via LLM", Object.keys(resolved).length);
        }
      }

      // ── Step 5: Log preference fields that will overwrite existing SMA values ──
      // We now ALWAYS sync new preference data from the call.
      const overwrittenPrefs: string[] = [];
      for (const prefKey of Object.keys(prefFields)) {
        if (prefKey.endsWith("_field_weight") || prefKey.endsWith("_start") || prefKey.endsWith("_end")) continue;
        if (isSmaFieldFilled(currentPrefFields[prefKey])) {
          overwrittenPrefs.push(prefKey);
        }
      }
      if (overwrittenPrefs.length > 0) {
        console.log("[syncCallToSMA] Overwriting %d preference fields with new data from call: %s",
          overwrittenPrefs.length, overwrittenPrefs.join(", "));
      }

      // willingToRelocate → longDistance (same SMA field prof_188)
      if (data.willingToRelocate && !profileFields.prof_188) {
        const val = String(data.willingToRelocate).toLowerCase();
        const ldMap: Record<string, string> = { "yes": "1", "true": "1", "no": "2", "false": "2", "maybe": "3" };
        const mapped = ldMap[val];
        if (mapped) {
          profileFields.prof_188 = mapped;
        }
      }

      // Matchmaker notes — fields without direct SMA mapping
      const noteLines: string[] = [];
      if (data.hometown) noteLines.push(`Hometown: ${data.hometown}`);
      if (data.kosherLevel) noteLines.push(`Kosher: ${data.kosherLevel}`);
      if (data.shabbatObservance) noteLines.push(`Shabbat: ${data.shabbatObservance}`);
      if (data.marriageTimeline) noteLines.push(`Marriage timeline: ${data.marriageTimeline}`);
      if (data.additionalNotes) noteLines.push(`Notes: ${data.additionalNotes}`);

      // ── Step 6: Write all collected fields to SMA (with retry on bad fields) ──
      // Each section is independently try-caught so one failure doesn't block the rest.
      console.log("[syncCallToSMA] Profile fields to sync: %d (%s)",
        Object.keys(profileFields).length, Object.keys(profileFields).join(", "));
      if (Object.keys(profileFields).length > 0) {
        try { await resilientSmaPut(smaClientId, profileFields, "profile"); }
        catch (e: any) { console.error("[syncCallToSMA] Profile sync failed (non-fatal):", e.message); }
      }

      console.log("[syncCallToSMA] Preference fields to sync: %d (%s)",
        Object.keys(prefFields).length, Object.keys(prefFields).join(", "));
      if (Object.keys(prefFields).length > 0) {
        try { await resilientSmaPut(smaClientId, prefFields, "preferences"); }
        catch (e: any) { console.error("[syncCallToSMA] Preferences sync failed (non-fatal):", e.message); }
      }

      // Upload voice notes via Files API
      const dateStr = new Date().toISOString().split("T")[0];
      const callSummary = call.aiSummary?.summary || "Voice intake call completed.";
      let noteContent = `Voice Call Summary (${dateStr}):\n${callSummary}`;
      if (noteLines.length > 0) {
        noteContent += `\n\nAdditional details:\n${noteLines.join("\n")}`;
      }

      console.log("[syncCallToSMA] Uploading voice notes file");
      await voiceNoteAppendAndReplace(smaClientId, noteContent);

      await ctx.runMutation(internal.voice.mutations.updateSmaSyncStatus, {
        callId: args.callId,
        status: "synced",
      });
      console.log("[syncCallToSMA] DONE — status: synced");
    } catch (err: any) {
      console.error("[syncCallToSMA] FAILED:", err.message);
      await ctx.runMutation(internal.voice.mutations.updateSmaSyncStatus, {
        callId: args.callId,
        status: "failed",
      });
    }
  },
});

// ── Helper Functions ─────────────────────────────────────────────────

/**
 * Try to PUT fields to SMA. If it fails with 400 (bad field), parse the
 * error, remove the offending fields, and retry once with the remaining fields.
 */
async function resilientSmaPut(
  smaClientId: number,
  fields: Record<string, string>,
  type: "profile" | "preferences",
): Promise<void> {
  const updateFn = type === "profile" ? updateClientProfile : updateClientPreferences;
  try {
    await updateFn(smaClientId, fields);
    console.log(`[syncCallToSMA] ${type} updated successfully`);
  } catch (err: any) {
    // Parse SMA 400 error to find bad field names
    // Error format: "SMA API PUT ... failed (400): {"errors": {"prof_187": [...]}}"
    const badFields: string[] = [];
    try {
      const jsonStart = err.message?.indexOf("): ");
      if (jsonStart > -1) {
        const jsonStr = err.message.substring(jsonStart + 3);
        const errBody = JSON.parse(jsonStr);
        if (errBody.errors && typeof errBody.errors === "object" && !Array.isArray(errBody.errors)) {
          badFields.push(...Object.keys(errBody.errors));
        }
      }
    } catch {}

    if (badFields.length > 0) {
      console.warn(`[syncCallToSMA] ${type} failed on fields: ${badFields.join(", ")} — removing and retrying`);
      const cleaned = { ...fields };
      for (const f of badFields) {
        delete cleaned[f];
        // Also remove sub-fields (e.g. prof_244_country when prof_244 fails)
        for (const k of Object.keys(cleaned)) {
          if (k.startsWith(f + "_")) delete cleaned[k];
        }
      }
      if (Object.keys(cleaned).length > 0) {
        try {
          await updateFn(smaClientId, cleaned);
          console.log(`[syncCallToSMA] ${type} updated successfully (after removing bad fields: ${badFields.join(", ")})`);
        } catch (retryErr: any) {
          // Try parsing retry error for more bad fields
          const moreBadFields: string[] = [];
          try {
            const jsonStart2 = retryErr.message?.indexOf("): ");
            if (jsonStart2 > -1) {
              const jsonStr2 = retryErr.message.substring(jsonStart2 + 3);
              const errBody2 = JSON.parse(jsonStr2);
              if (errBody2.errors && typeof errBody2.errors === "object" && !Array.isArray(errBody2.errors)) {
                moreBadFields.push(...Object.keys(errBody2.errors));
              }
            }
          } catch {}
          if (moreBadFields.length > 0) {
            console.warn(`[syncCallToSMA] ${type} retry failed on: ${moreBadFields.join(", ")} — removing and retrying once more`);
            for (const f of moreBadFields) delete cleaned[f];
            if (Object.keys(cleaned).length > 0) {
              await updateFn(smaClientId, cleaned);
              console.log(`[syncCallToSMA] ${type} updated successfully (after removing: ${[...badFields, ...moreBadFields].join(", ")})`);
            }
          } else {
            console.error(`[syncCallToSMA] ${type} retry also failed:`, retryErr.message);
            // Don't throw — continue with notes upload at least
          }
        }
      } else {
        console.warn(`[syncCallToSMA] ${type} — all fields were bad, nothing to sync`);
      }
    } else {
      throw err;
    }
  }
}

/**
 * Check if an SMA field already has a non-empty value.
 * Works for all field types: text, select, multiselect, location, height, etc.
 */
function isSmaFieldFilled(field: any): boolean {
  if (!field || field.value == null) return false;
  const val = field.value;
  const type = (field.type ?? "").toLowerCase();

  // Text / short_text / long_text: empty string = not filled
  if (typeof val === "string") return val.trim() !== "";

  // Select: has a chosen option
  if (type === "select") {
    return !!(val.id || val.choice_label || val.label);
  }

  // Multiselect: has at least one chosen option
  if (type === "multiselect" || type === "multi_select") {
    if (Array.isArray(val)) return val.length > 0;
    return !!(val.id || val.choice_label || val.label);
  }

  // Location: at least one sub-field filled
  if (type === "location") {
    return !!(val.country || val.city || val.state || val.zip_code);
  }

  // Height / number: any truthy number
  if (typeof val === "number") return val > 0;

  // Fallback: truthy check
  return !!val;
}

function parseHeightToMm(height: string): number | null {
  // Use exact SMA lookup table first
  const smaVal = heightToSmaValue(height);
  if (smaVal) return smaVal;
  // Fallback: calculate for cm inputs
  const cmMatch = height.match(/(\d+)\s*cm/i);
  if (cmMatch) return parseInt(cmMatch[1]) * 10;
  return null;
}

// Common country name → ISO 2-letter code mapping (SMA requires codes)
const COUNTRY_CODES: Record<string, string> = {
  "united states": "US", "usa": "US", "us": "US", "america": "US",
  "israel": "IL", "canada": "CA", "united kingdom": "GB", "uk": "GB",
  "france": "FR", "australia": "AU", "south africa": "ZA", "brazil": "BR",
  "argentina": "AR", "germany": "DE", "mexico": "MX", "spain": "ES",
  "italy": "IT", "netherlands": "NL", "sweden": "SE", "switzerland": "CH",
};

// Common US state name → abbreviation mapping
const STATE_ABBREVS: Record<string, string> = {
  "florida": "FL", "california": "CA", "new york": "NY", "texas": "TX",
  "illinois": "IL", "pennsylvania": "PA", "ohio": "OH", "georgia": "GA",
  "north carolina": "NC", "michigan": "MI", "new jersey": "NJ",
  "virginia": "VA", "washington": "WA", "arizona": "AZ", "massachusetts": "MA",
  "tennessee": "TN", "indiana": "IN", "missouri": "MO", "maryland": "MD",
  "wisconsin": "WI", "colorado": "CO", "minnesota": "MN", "connecticut": "CT",
  "oregon": "OR", "nevada": "NV", "utah": "UT", "district of columbia": "DC",
};

function parseLocation(location: string): { country?: string; city?: string; state?: string; zipCode?: string } {
  const parts = location.split(",").map((s) => s.trim());
  let city: string | undefined;
  let state: string | undefined;
  let country: string | undefined;

  if (parts.length >= 3) {
    city = parts[0];
    state = parts[1];
    country = parts[2];
  } else if (parts.length === 2) {
    city = parts[0];
    state = parts[1];
  } else {
    city = location;
  }

  // Convert country to code
  if (country) {
    const code = COUNTRY_CODES[country.toLowerCase()] || (country.length === 2 ? country.toUpperCase() : undefined);
    country = code || country;
  } else {
    // Default to US if no country specified
    country = "US";
  }

  // Convert state to abbreviation
  if (state) {
    const abbrev = STATE_ABBREVS[state.toLowerCase()];
    if (abbrev) state = abbrev;
  }

  return { city, state, country };
}

function parseAgeRange(range: string): { start: number; end: number } | null {
  const match = range.match(/(\d+)\s*[-\u2013to]+\s*(\d+)/);
  if (match) return { start: parseInt(match[1]), end: parseInt(match[2]) };
  return null;
}

// SMA height values lookup table (ft'in" → mm)
const HEIGHT_MM_TABLE: Record<string, number> = {
  "4'0": 1219, "4'1": 1245, "4'2": 1270, "4'3": 1295, "4'4": 1321, "4'5": 1346,
  "4'6": 1372, "4'7": 1397, "4'8": 1422, "4'9": 1448, "4'10": 1473, "4'11": 1499,
  "5'0": 1524, "5'1": 1549, "5'2": 1575, "5'3": 1600, "5'4": 1626, "5'5": 1651,
  "5'6": 1676, "5'7": 1702, "5'8": 1727, "5'9": 1753, "5'10": 1778, "5'11": 1803,
  "6'0": 1829, "6'1": 1854, "6'2": 1880, "6'3": 1905, "6'4": 1930, "6'5": 1956,
  "6'6": 1981, "6'7": 2007, "6'8": 2032, "6'9": 2057, "6'10": 2083, "6'11": 2108,
  "7'0": 2134,
};

function heightToSmaValue(height: string): number | null {
  // Try exact match first: "5'10" or "5'10\""
  const clean = height.replace(/["″\s]/g, "").replace(/[''′]/g, "'");
  if (HEIGHT_MM_TABLE[clean]) return HEIGHT_MM_TABLE[clean];
  // Try ft/in parse
  const match = clean.match(/(\d+)'(\d+)/);
  if (match) {
    const key = `${match[1]}'${match[2]}`;
    return HEIGHT_MM_TABLE[key] ?? null;
  }
  return null;
}

function parseHeightRange(range: string): { start: number; end: number } | null {
  // Parse "5'4 - 6'0" or "5'4\" to 6'0\"" etc.
  const parts = range.split(/\s*[-–to]+\s*/);
  if (parts.length >= 2) {
    const start = heightToSmaValue(parts[0]);
    const end = heightToSmaValue(parts[parts.length - 1]);
    if (start && end) return { start, end };
  }
  return null;
}

// Hardcoded SMA select/multiselect choice IDs (API doesn't return choices on GET)
const SMA_CHOICES: Record<string, string> = {
  // Profile select fields
  prof_132: "1:Male, 2:Female, 3:Non-binary",
  prof_133: "4:Asian, 11:Black, 10:Caucasian, 8:East Indian, 12:Hispanic/Latino, 9:Indian American, 5:Middle Eastern, 13:Multiracial, 6:Pacific Islander, 14:Other, 15:No Preference",
  prof_158: "1:Under $50k, 4:$50k-$100k, 3:$100k-$150k, 5:$150k-$250k, 6:$250k-$500k, 7:$500k+",
  prof_144: "4:Jewish, 25:Christian, 3:Muslim, 5:Hindu, 6:Buddhist, 7:Agnostic, 8:Atheist, 9:Spiritual, 10:Other",
  prof_142: "1:Single, 2:It's Complicated, 3:Taken, 4:Here for Friends",
  prof_165: "1:Conservative, 2:Liberal, 3:Middle of the Road, 4:Independent, 5:Not Political",
  prof_136: "1:Black, 2:Blonde, 3:Brown, 4:Red, 5:Auburn, 6:Gray, 7:White, 8:Bald",
  prof_169: "1:Brown, 2:Blue, 3:Green, 4:Hazel, 5:Gray, 6:Amber",
  prof_172: "1:Straight, 2:Gay, 3:Lesbian, 4:Bisexual, 5:Other",
  prof_23: "2:Yes socially, 3:Yes regularly, 5:No",
  prof_24: "2:Yes socially, 3:Yes regularly, 1:No",
  prof_50: "4:No, 5:Yes",
  prof_167: "1:High School, 2:Some College, 3:Associates, 4:Bachelors, 5:Graduate/Masters, 6:J.D./M.D./PhD",
  // Profile multiselect fields
  prof_187: "1:Conservative, 2:Reform, 3:Modern Orthodox, 4:Traditional, 5:Spiritual but not Religious",
  prof_234: "1:Trust, 2:Respect, 3:Communication, 4:Loyalty, 5:Honesty, 6:Family, 7:Humor, 8:Ambition, 9:Kindness, 10:Faith, 11:Adventure, 12:Stability",
  prof_181: "1:American, 2:Israeli, 3:Canadian, 4:British, 5:French, 6:South African, 7:Australian, 8:Brazilian, 9:Argentinian, 10:Other",
  // Preference select fields
  pref_36: "1:Female, 2:Male, 3:Non-binary",
  pref_41: "1:Straight, 2:Gay, 3:Lesbian, 4:Bisexual, 5:Other",
  pref_25: "1:Single, 2:It's Complicated, 3:Taken, 4:Here for Friends, 5:No Preference",
  pref_26: "4:Asian, 11:Black, 10:Caucasian, 8:East Indian, 12:Hispanic/Latino, 9:Indian American, 5:Middle Eastern, 13:Multiracial, 6:Pacific Islander, 14:Other, 15:No Preference",
  pref_27: "4:Jewish, 25:Christian, 3:Muslim, 5:Hindu, 6:Buddhist, 7:Agnostic, 8:Atheist, 9:Spiritual, 10:Other",
  pref_28: "1:High School, 4:Bachelors, 5:Graduate, 6:J.D./M.D./PhD",
  pref_43: "1:Under $50k, 4:$50k-$100k, 3:$100k-$150k, 5:$150k-$250k, 6:$250k-$500k, 7:$500k+",
  pref_48: "1:Black, 2:Blonde, 3:Brown, 4:Red, 11:No Preference",
  pref_49: "1:Brown, 2:Blue, 3:Green, 4:Hazel, 6:No Preference",
  pref_35: "1:Conservative, 2:Liberal, 3:Middle, 4:Independent",
  pref_33: "2:Yes socially, 3:Yes regularly, 5:No",
  pref_34: "2:Yes socially, 3:Yes regularly, 1:No",
  // Preference multiselect fields
  pref_50: "1:No, 2:Yes not impacting, 3:Shared custody, 4:Dependent",
  pref_51: "1:Yes, 2:No, 3:Maybe",
  pref_84: "1:Trust, 2:Respect, 3:Communication, 4:Loyalty, 5:Honesty, 6:Family, 7:Humor, 8:Ambition, 9:Kindness, 10:Faith, 11:Adventure, 12:Stability",
  pref_52: "1:Pickleball, 5:Dining Out, 8:Travel, 14:Hiking, 3:Fitness, 6:Music, 7:Art, 9:Reading, 10:Cooking, 11:Sports, 12:Gaming, 13:Movies, 15:Yoga, 16:Dancing",
};

function buildSelectResolvePrompt(
  selectFields: Array<{ dataKey: string; smaField: string; value: string }>,
  _allSmaFields: Record<string, any>,
): string {
  const lines: string[] = ["Map these voice call values to SMA CRM choice IDs. For multiselect fields, return comma-separated IDs (e.g. \"3,6\"):\n"];

  for (const { dataKey, smaField, value } of selectFields) {
    const choiceStr = SMA_CHOICES[smaField];
    if (!choiceStr) continue;

    lines.push(`Field ${smaField} (${dataKey}): value="${value}", choices=[${choiceStr}]`);
  }

  if (lines.length <= 1) return "";
  return lines.join("\n");
}

async function resolveSelectFieldsViaLLM(prompt: string): Promise<Record<string, string>> {
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenRouterApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a data mapping assistant. Given profile field values from a voice call and SMA CRM field choices, return the best matching choice ID for each field. Respond with ONLY valid JSON: { \"prof_XXX\": \"choice_id\", ... }. If no good match, omit the field.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) return {};
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

// ── Voice Notes File Management ──────────────────────────────────────

const VOICE_NOTES_PREFIX = "voice-notes-";

async function voiceNoteAppendAndReplace(clientSmaId: number, newEntry: string): Promise<void> {
  let existingContent = "";

  try {
    const files = await listClientFiles(clientSmaId);
    const voiceFiles = files.filter((f: any) => f.name && f.name.startsWith(VOICE_NOTES_PREFIX));

    if (voiceFiles.length > 0) {
      try {
        existingContent = await downloadClientFile(clientSmaId, voiceFiles[0]);
      } catch {}

      for (const oldFile of voiceFiles) {
        try { await deleteClientFile(clientSmaId, oldFile.id); } catch {}
      }
    }
  } catch {}

  const date = new Date().toISOString().split("T")[0];
  let combined: string;

  if (existingContent.trim()) {
    const stripped = existingContent
      .replace(/\n---\nAuto-generated by Club Allenby Voice Agent\s*$/, "")
      .trimEnd();
    combined = `${stripped}\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n[${date}] ${newEntry}\n\n---\nAuto-generated by Club Allenby Voice Agent`;
  } else {
    combined = `[${date}] ${newEntry}\n\n---\nAuto-generated by Club Allenby Voice Agent`;
  }

  const fileName = `${VOICE_NOTES_PREFIX}${date}.txt`;
  await uploadClientFile(clientSmaId, fileName, combined);
}
