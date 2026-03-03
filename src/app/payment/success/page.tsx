"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useWebHaptics } from "web-haptics/react";

export default function PaymentSuccessPage() {
  const hasFired = useRef(false);
  const { trigger } = useWebHaptics();

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    // Haptic feedback on mobile
    trigger("success");

    // Confetti burst
    const duration = 2500;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        colors: ["#4ade80", "#22c55e", "#16a34a"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        colors: ["#4ade80", "#22c55e", "#16a34a"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, [trigger]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Checkmark */}
        <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-900">
          Payment Confirmed
        </h1>

        <p className="text-gray-600 text-lg leading-relaxed">
          Your Personal Outreach has been activated. We&apos;ll reach out to
          your match on your behalf and keep you updated on WhatsApp.
        </p>

        <div className="pt-4 text-sm text-gray-400">
          You can close this page and return to WhatsApp.
        </div>
      </div>
    </div>
  );
}
