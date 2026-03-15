import { Doc } from "../_generated/dataModel";

/**
 * Returns an array of field names that are missing from a member's profile.
 * Used by both backend (cron, mutations) and referenced by frontend.
 */
export function getMissingFields(member: Doc<"members">): string[] {
  const missing: string[] = [];
  const profileData = member.profileData as Record<string, any> | undefined;

  if (!member.email) missing.push("email");
  if (!member.location?.city) missing.push("location");
  if (!member.profilePictureUrl) missing.push("profilePicture");
  if (!profileData?.instagram) missing.push("instagram");
  if (!profileData?.tiktok) missing.push("tiktok");
  if (!profileData?.linkedin) missing.push("linkedin");

  return missing;
}
