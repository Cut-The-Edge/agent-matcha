// @ts-nocheck
/**
 * SmartMatchApp Contact Sync
 *
 * Fetches client profiles from SMA and maps them to our member schema.
 * Used by the webhook handler and periodic sync cron.
 */

import { getClientProfile, getClientDetails } from "./client";

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
  prof_244: "location",
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
export async function fetchAndMapClient(smaClientId: number): Promise<{
  smaId: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  profilePictureUrl?: string;
  location?: { country?: string; city?: string; state?: string; zipCode?: string };
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

  return {
    smaId: String(smaClientId),
    firstName: mapped.firstName || "Unknown",
    middleName: mapped.middleName,
    lastName: mapped.lastName,
    email: mapped.email,
    phone: mapped.phone,
    profilePictureUrl,
    location: mapped.location,
    tier: mapTier(allFields.prof_197?.value),
    profileComplete,
    matchmakerNotes: mapped.matchmakerNotes,
    smaProfile: mapped,
  };
}
