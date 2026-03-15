"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useParams } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

const REFERRAL_OPTIONS = [
  "Instagram",
  "TikTok",
  "Press",
  "Facebook",
  "Friend/Family",
  "Other",
];

function getCroppedImg(imageSrc: string, crop: Area): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = crop.width;
      canvas.height = crop.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
      );
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas blob failed"))),
        "image/jpeg",
        0.9
      );
    };
    image.onerror = reject;
    image.src = imageSrc;
  });
}

export default function DataRequestFormPage() {
  const { token } = useParams<{ token: string }>();
  const data = useQuery(api.dataRequests.queries.getByToken, { token: token ?? "" });
  const submitForm = useMutation(api.dataRequests.mutations.submitForm);
  const generateUploadUrl = useMutation(api.dataRequests.storage.generateUploadUrl);

  // Form state
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [referralSource, setReferralSource] = useState<string[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [closeStoriesConsent, setCloseStoriesConsent] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from member data (for both pending and resubmit-allowed completed)
  const prefilled = useRef(false);
  if (data && "member" in data && !prefilled.current) {
    prefilled.current = true;
    const m = data.member;
    if (m.email && !email) setEmail(m.email);
    if (m.location?.city && !city) setCity(m.location.city);
    if (m.location?.state && !state) setState(m.location.state);
    if (m.location?.country && !country) setCountry(m.location.country);
    const pd = m.profileData as Record<string, any> | undefined;
    if (pd?.instagram && !instagram) setInstagram(pd.instagram);
    if (pd?.tiktok && !tiktok) setTiktok(pd.tiktok);
    if (pd?.linkedin && !linkedin) setLinkedin(pd.linkedin);
  }

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setShowCropper(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let profilePictureStorageId: string | undefined;

      // Upload cropped photo if present
      if (photoPreview && croppedArea) {
        const croppedBlob = await getCroppedImg(photoPreview, croppedArea);
        const uploadUrl = await generateUploadUrl({ token });
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: croppedBlob,
        });
        if (!uploadResult.ok) throw new Error("Photo upload failed");
        const { storageId } = await uploadResult.json();
        profilePictureStorageId = storageId;
      }

      await submitForm({
        token,
        email: email || undefined,
        location:
          city || state || country
            ? {
                city: city || undefined,
                state: state || undefined,
                country: country || undefined,
              }
            : undefined,
        profilePictureStorageId,
        instagram: instagram || undefined,
        tiktok: tiktok || undefined,
        linkedin: linkedin || undefined,
        referralSource: referralSource.length > 0 ? referralSource : undefined,
        inviteCode: inviteCode || undefined,
        closeStoriesConsent: closeStoriesConsent || undefined,
      });

      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReferral = (option: string) => {
    setReferralSource((prev) =>
      prev.includes(option)
        ? prev.filter((o) => o !== option)
        : [...prev, option]
    );
  };

  // --- Render states ---

  // Loading
  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0eeeb]">
        <div className="flex animate-pulse flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gray-200" />
          <div className="h-4 w-32 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  // Not found
  if (data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0eeeb] px-6">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-800">Form Not Found</h1>
          <p className="text-sm text-gray-500">This form link is no longer valid.</p>
        </div>
      </div>
    );
  }

  // Expired
  if ("expired" in data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0eeeb] px-6">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-800">Link Expired</h1>
          <p className="text-sm text-gray-500">
            This form link has expired. Please contact us for a new one.
          </p>
        </div>
      </div>
    );
  }

  // Already completed (and resubmit NOT allowed)
  if ("completed" in data && !("allowResubmit" in data)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0eeeb] px-6">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-800">Already Submitted</h1>
          <p className="text-sm text-gray-500">
            You've already filled out this form. Thank you!
          </p>
        </div>
      </div>
    );
  }

  // Success screen
  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0eeeb] px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-gray-800">Thank You!</h1>
          <p className="text-sm text-gray-500">
            Your information has been saved. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  // Form
  const member = data.member;
  const existingPhoto = member.profilePictureUrl;

  return (
    <div className="min-h-screen bg-[#f0eeeb]">
      <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="text-3xl" role="img" aria-label="matcha">🍵</span>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Hi {member.firstName}!
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Help us complete your profile at Club Allenby
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Profile Picture */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <label className="mb-3 block text-sm font-medium text-gray-700">
              Profile Picture
            </label>
            {showCropper && photoPreview ? (
              <div className="space-y-3">
                <div className="relative h-64 w-full overflow-hidden rounded-lg bg-gray-100">
                  <Cropper
                    image={photoPreview}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCropper(false);
                    setPhotoPreview(null);
                    setCroppedArea(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {existingPhoto && !photoPreview && (
                  <img
                    src={existingPhoto}
                    alt="Current"
                    className="h-24 w-24 rounded-full object-cover"
                  />
                )}
                <label className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 px-6 py-4 text-center transition-colors hover:border-gray-400">
                  <span className="text-sm text-gray-600">
                    {existingPhoto ? "Upload a new photo" : "Drag & drop or click to upload"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-gray-700">Contact</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-gray-700">Location</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">State</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Social Media */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-gray-700">Social Media</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Instagram</label>
                <div className="flex items-center rounded-lg border border-gray-200">
                  <span className="pl-3 text-sm text-gray-400">@</span>
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="username"
                    className="w-full rounded-r-lg px-2 py-2 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">TikTok</label>
                <div className="flex items-center rounded-lg border border-gray-200">
                  <span className="pl-3 text-sm text-gray-400">@</span>
                  <input
                    type="text"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="username"
                    className="w-full rounded-r-lg px-2 py-2 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">LinkedIn</label>
                <input
                  type="text"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Referral & Consent */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-gray-700">
              How did you hear about us?
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {REFERRAL_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleReferral(option)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    referralSource.includes(option)
                      ? "border-gray-800 bg-gray-800 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs text-gray-500">
                Referral / Invite Code
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter code (optional)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </div>

            <div className="mt-4">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={closeStoriesConsent}
                  onChange={(e) => setCloseStoriesConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">
                  I consent to being featured in Club Allenby&apos;s Close Friends stories
                </span>
              </label>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Shared via Agent Matcha
          </p>
        </form>
      </div>
    </div>
  );
}
