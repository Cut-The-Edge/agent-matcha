// @ts-nocheck
/**
 * SmartMatchApp Contact Sync
 *
 * Fetches client profiles from SMA and maps them to our member schema.
 * Used by the webhook handler and periodic sync cron.
 */

import { getClientProfile, getClientDetails, smaGet } from "./client";

/**
 * SMA profile field IDs → human-readable keys.
 * See docs/sma-api-reference.md for the full mapping.
 */
const PROFILE_FIELD_MAP: Record<string, string> = {
  prof_239: "firstName",
  prof_241: "lastName",
  prof_240: "middleName",
  prof_242: "email",
  prof_243: "phone",
  prof_163: "occupation",
  prof_131: "birthdate",
  prof_233: "age",
  prof_144: "religion",        // Select → { choice, choice_label }
  prof_187: "jewishObservance", // MultiSelect
  prof_133: "ethnicity",       // Select
  prof_142: "relationshipStatus", // Select
  prof_170: "height",
  prof_161: "languages",
  prof_174: "hasChildren",     // Select
  prof_19:  "wantChildren",    // Select
  prof_188: "longDistance",    // Select
  prof_197: "membershipType",  // MultiSelect
  prof_235: "matchmakerNotes",
  prof_184: "careerOverview",
  prof_182: "upbringing",
  prof_186: "dayInLife",
  prof_189: "weekendPreferences",
  prof_190: "friendsDescribe",
  prof_195: "relationshipHistory",
  prof_196: "childrenDetails",
  prof_237: "coverPhoto",
  prof_132: "gender",
  prof_244: "location",
  prof_165: "politicalAffiliation", // Select
  prof_185: "interests",            // MultiSelect (top 6)
  prof_194: "currentRelationshipStatus", // MultiSelect
  prof_176: "instagram",
  prof_177: "tiktok",
  prof_178: "linkedin",
};

/**
 * Map SMA membership type IDs to our tier values.
 * 5 = Waitlist (free), 7 = Single Submission (free),
 * 2 = Membership (member), 6 = VIP (vip)
 */
function mapTier(membershipType: any): "free" | "member" | "vip" {
  if (!membershipType || !Array.isArray(membershipType)) return "free";
  const ids = membershipType.map((v: any) => v.choice);
  if (ids.includes(6)) return "vip";
  if (ids.includes(2)) return "member";
  return "free";
}

/**
 * Extract a flat value from an SMA field based on its type.
 */
function extractValue(field: any): any {
  if (field == null || field.value == null) return null;
  const val = field.value;
  const type = field.type;

  if (type === "Select") {
    return val.choice_label ?? val.label ?? null;
  }
  if (type === "MultiSelect" && Array.isArray(val)) {
    return val.map((v: any) => v.choice_label ?? v.label).join(", ");
  }
  if (type === "Image") {
    return val; // { name, url } — caller extracts .url
  }
  if (type === "Location") {
    return {
      country: val.country || undefined,
      city: val.city || undefined,
      state: val.state || undefined,
      zipCode: val.zip_code || undefined,
    };
  }
  // Short Text, Long Text, PhoneNumber, Email, Birthday, etc.
  return val;
}

/**
 * Fetch a full SMA client profile and map it to a flat object
 * compatible with our members table.
 */
/**
 * Normalize SMA gender label to our enum.
 */
function normalizeGender(label: string | null | undefined): "male" | "female" | "other" | undefined {
  if (!label) return undefined;
  const lower = label.toLowerCase();
  if (lower === "male" || lower === "man") return "male";
  if (lower === "female" || lower === "woman") return "female";
  return "other";
}

export async function fetchAndMapClient(smaClientId: number): Promise<{
  smaId: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  profilePictureUrl?: string;
  location?: { country?: string; city?: string; state?: string; zipCode?: string };
  gender?: "male" | "female" | "other";
  tier: "free" | "member" | "vip";
  profileComplete: boolean;
  matchmakerNotes?: string;
  smaProfile: Record<string, any>;
}> {
  const groups = await getClientProfile(smaClientId);

  // Flatten all fields from all groups into a single dict keyed by prof_XXX
  const allFields: Record<string, any> = {};
  for (const group of groups) {
    if (group.fields) {
      for (const [fieldId, field] of Object.entries(group.fields)) {
        allFields[fieldId] = field;
      }
    }
  }

  // Map to human-readable keys
  const mapped: Record<string, any> = {};
  for (const [fieldId, key] of Object.entries(PROFILE_FIELD_MAP)) {
    const val = extractValue(allFields[fieldId]);
    if (val != null && val !== "") {
      mapped[key] = val;
    }
  }

  // Count how many key fields are filled to estimate profile completeness
  const keyFields = [
    "firstName", "phone", "occupation", "religion", "jewishObservance",
    "ethnicity", "relationshipHistory", "dayInLife", "matchmakerNotes",
  ];
  const filledCount = keyFields.filter((k) => mapped[k]).length;
  const profileComplete = filledCount >= 6;

  // Extract profilePictureUrl from Image field (coverPhoto)
  const coverPhoto = mapped.coverPhoto;
  const profilePictureUrl =
    typeof coverPhoto === "object" && coverPhoto?.url
      ? coverPhoto.url
      : typeof coverPhoto === "string"
        ? coverPhoto
        : undefined;

  // Extract gender from the Select field
  const gender = normalizeGender(mapped.gender);

  return {
    smaId: String(smaClientId),
    firstName: mapped.firstName || "Unknown",
    middleName: mapped.middleName,
    lastName: mapped.lastName,
    email: mapped.email,
    phone: mapped.phone,
    profilePictureUrl,
    location: mapped.location,
    gender,
    tier: mapTier(allFields.prof_197?.value),
    profileComplete,
    matchmakerNotes: mapped.matchmakerNotes,
    smaProfile: mapped,
  };
}

/**
 * SMA introduction group name → summary key mapping.
 * The API returns group names like "Active Introductions", "Automated Intro", etc.
 * We normalize variations to our standard keys.
 */
function groupNameToKey(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("successful")) return "successful";
  if (lower.includes("active")) return "active";
  if (lower.includes("potential")) return "potential";
  if (lower.includes("rejected")) return "rejected";
  if (lower.includes("past")) return "past";
  if (lower.includes("automated")) return "automated";
  if (lower.includes("not suitable")) return "notSuitable";
  return "notSuitable";
}

/**
 * Fetch all introductions for a member from SMA and map them.
 *
 * The SMA `/matches/` endpoint returns a flat paginated list:
 * { objects: [ { id, group: {id,name}, client: {id}, match: {id}, ... } ], total_count }
 * We group them by group.name ourselves.
 */
export async function fetchAndMapIntroductions(
  smaClientId: number,
  localMemberLookup?: (smaId: string) => Promise<string | null>,
): Promise<{
  summary: {
    successful: number;
    active: number;
    potential: number;
    rejected: number;
    past: number;
    automated: number;
    notSuitable: number;
    total: number;
    lastFetchedAt: number;
  };
  introductions: Array<{
    smaMatchId: number;
    memberSmaId: string;
    partnerSmaId: string;
    partnerName?: string;
    group: string;
    groupId: number;
    clientPercent?: number;
    matchPercent?: number;
    matchmakerName?: string;
    smaCreatedDate: string;
    syncedAt: number;
  }>;
}> {
  // Fetch all matches (up to 100) — API returns flat { objects: [...] }
  const matchData = await smaGet(`/clients/${smaClientId}/matches/`, { count: "100" });
  const now = Date.now();
  const memberSmaId = String(smaClientId);

  const counts: Record<string, number> = {
    successful: 0, active: 0, potential: 0, rejected: 0,
    past: 0, automated: 0, notSuitable: 0,
  };

  // Parse the flat objects array
  const objects: any[] = matchData?.objects ?? [];
  const partnerIdsToResolve = new Set<string>();
  const matchEntries: Array<{
    matchRecord: any;
    partnerSmaId: string;
    groupName: string;
    groupId: number;
  }> = [];

  for (const m of objects) {
    const groupName = m.group?.name ?? "Unknown";
    const groupId = m.group?.id ?? 0;
    const groupKey = groupNameToKey(groupName);
    counts[groupKey] = (counts[groupKey] ?? 0) + 1;

    // Determine partner: the side that isn't us
    const clientId = String(m.client?.id ?? "");
    const matchId = String(m.match?.id ?? "");
    const partnerSmaId = clientId === memberSmaId ? matchId : clientId;

    partnerIdsToResolve.add(partnerSmaId);
    matchEntries.push({ matchRecord: m, partnerSmaId, groupName, groupId });
  }

  // Resolve partner names: local DB first, then SMA API fallback
  const partnerNames: Record<string, string> = {};

  if (localMemberLookup) {
    for (const pid of partnerIdsToResolve) {
      const localName = await localMemberLookup(pid);
      if (localName) {
        partnerNames[pid] = localName;
        partnerIdsToResolve.delete(pid);
      }
    }
  }

  // Fetch remaining from SMA profile API (rate-limited)
  const remaining = Array.from(partnerIdsToResolve);
  for (let i = 0; i < remaining.length; i++) {
    try {
      const pid = remaining[i];
      const profile = await smaGet(`/clients/${pid}/profile/`);
      let firstName = "";
      let lastName = "";
      for (const g of (Array.isArray(profile) ? profile : [])) {
        if (g.fields) {
          if (g.fields.prof_239?.value) firstName = g.fields.prof_239.value;
          if (g.fields.prof_241?.value) lastName = g.fields.prof_241.value;
        }
      }
      if (firstName) {
        partnerNames[pid] = `${firstName}${lastName ? ` ${lastName}` : ""}`;
      }
    } catch (err) {
      console.warn(`Failed to fetch partner name for smaId=${remaining[i]}:`, err);
    }
    // Rate limit: 5 req / 10s → ~2s between requests
    if (i < remaining.length - 1) {
      await new Promise((r) => setTimeout(r, 2100));
    }
  }

  // Build introduction records
  const introductions: Array<any> = [];
  for (const entry of matchEntries) {
    const m = entry.matchRecord;
    introductions.push({
      smaMatchId: m.id ?? 0,
      memberSmaId,
      partnerSmaId: entry.partnerSmaId,
      partnerName: partnerNames[entry.partnerSmaId],
      group: entry.groupName,
      groupId: entry.groupId,
      clientPercent: m.client_percent,
      matchPercent: m.match_percent,
      matchmakerName: m.user?.first_name
        ? `${m.user.first_name}${m.user.last_name ? ` ${m.user.last_name}` : ""}`
        : undefined,
      smaCreatedDate: m.created_date ?? new Date().toISOString(),
      syncedAt: now,
      // Enriched match detail fields
      matchStatus: m.status?.name ?? undefined,
      matchStatusId: m.status?.id ?? undefined,
      clientStatus: m.client_status?.name ?? undefined,
      clientStatusId: m.client_status?.id ?? undefined,
      matchPartnerStatus: m.match_status?.name ?? undefined,
      matchPartnerStatusId: m.match_status?.id ?? undefined,
      clientPriority: m.client_priority ?? undefined,
      matchPriority: m.match_priority ?? undefined,
      clientDueDate: m.client_due_date ?? undefined,
      matchDueDate: m.match_due_date ?? undefined,
    });
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    summary: {
      ...counts as any,
      total,
      lastFetchedAt: now,
    },
    introductions,
  };
}
