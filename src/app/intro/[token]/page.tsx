"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useParams } from "next/navigation";

function BadgeList({ value }: { value: string | undefined | null }) {
  if (!value) return null;
  const items = value.split(", ").filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-block rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function FieldRow({
  label,
  value,
  badges,
  icon,
}: {
  label: string;
  value?: string | null;
  badges?: string | null;
  icon?: string;
}) {
  if (!value && !badges) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 text-sm sm:w-[260px] shrink-0">{label}</span>
      <div className="flex-1">
        {badges ? (
          <BadgeList value={badges} />
        ) : (
          <span className="text-gray-800 text-sm font-medium whitespace-pre-line">
            {icon && <span className="mr-1">{icon}</span>}
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

export default function IntroProfilePage() {
  const { token } = useParams<{ token: string }>();
  const profile = useQuery(api.matches.queries.getProfileByIntroToken, { token: token ?? "" });

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-200" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (profile && "expired" in profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Link Expired</h1>
          <p className="text-gray-500 text-sm">This profile link has expired and is no longer accessible.</p>
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Profile Not Found</h1>
          <p className="text-gray-500 text-sm">This introduction link may have expired or is no longer valid.</p>
        </div>
      </div>
    );
  }

  const photoUrl = profile.coverPhotoUrl || profile.profilePictureUrl;
  const locationStr = [profile.location?.city, profile.location?.state, profile.location?.country]
    .filter(Boolean)
    .join(", ");
  const displayAge = profile.age || profile.birthdate;

  return (
    <div className="min-h-screen bg-[#f0eeeb]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Left: Photo */}
          <div className="md:w-[300px] shrink-0">
            {photoUrl ? (
              <div className="overflow-hidden rounded-xl">
                <img
                  src={photoUrl}
                  alt={`${profile.firstName}'s photo`}
                  className="w-full aspect-[3/4] object-cover"
                />
              </div>
            ) : (
              <div className="w-full aspect-[3/4] rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <span className="text-6xl font-bold text-white/60">
                  {profile.firstName?.[0] || "?"}
                </span>
              </div>
            )}
          </div>

          {/* Right: All fields in one table */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6 pb-1">
                <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
                <span className="text-xs text-gray-300 font-medium tracking-wide">allenby</span>
              </div>

              <div className="px-6 pb-6">
                <FieldRow label="First Name" value={profile.firstName} />
                <FieldRow label="Location" value={locationStr || undefined} icon="📍" />
                <FieldRow label="Birthdate" value={displayAge ? String(displayAge) : undefined} />
                <FieldRow label="Occupation" value={profile.occupation} />
                <FieldRow label="Faith/Religion" value={profile.religion} />
                <FieldRow
                  label="If you selected Jewish, what level of observance do you most identify with? Please select all that a"
                  badges={profile.jewishObservance}
                />
                <FieldRow label="What is your political affiliation?" value={profile.politicalAffiliation} />
                <FieldRow
                  label="Choose 6 of the following that best describe your interests"
                  badges={profile.interests}
                />
                <FieldRow
                  label="Current Relationship Status"
                  badges={profile.currentRelationshipStatus || profile.relationshipStatus}
                />
                <FieldRow label="Do you have children?" value={profile.hasChildren} />
                <FieldRow label="Do you want (more) children?" value={profile.wantChildren} />
                <FieldRow
                  label="How would your friends describe you? Please list 3-5 adjectives."
                  value={profile.friendsDescribe}
                />
                <FieldRow label="Height" value={profile.height ? String(profile.height) : undefined} />
                <FieldRow label="Languages spoken" value={profile.languages} />
                <FieldRow label="Ethnicity" value={profile.ethnicity} />
                <FieldRow label="Career overview" value={profile.careerOverview} />
                <FieldRow label="Upbringing & family values" value={profile.upbringing} />
                <FieldRow label="Day in your life" value={profile.dayInLife} />
                <FieldRow label="Weekend preferences" value={profile.weekendPreferences} />
                <FieldRow label="Relationship history overview" value={profile.relationshipHistory} />
                <FieldRow label="Children details" value={profile.childrenDetails} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">Shared via Agent Matcha</p>
        </div>
      </div>
    </div>
  );
}
