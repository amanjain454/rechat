"use client";

import { useEffect, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent, type AnalyticsConsent as Consent } from "@/lib/analytics-consent";

export default function AnalyticsConsent() {
  const [choice, setChoice] = useState<Consent | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    const sync = () => { const current = getAnalyticsConsent(); setChoice(current); setOpen(current === "unset"); };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function choose(next: "allowed" | "declined") {
    setStorageWarning(!setAnalyticsConsent(next));
    setChoice(next);
    setOpen(false);
  }
  return (
    <footer className="px-4 py-3 text-center text-xs text-stone-600">
      <button type="button" className="underline underline-offset-4" onClick={() => setOpen(true)}>Privacy &amp; Analytics</button>
      {storageWarning && <p role="status">Your browser could not save this preference for future visits.</p>}
      {choice !== null && open && (
        <section aria-label="Analytics preferences" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-xl border border-stone-300 bg-[#fbfaf6] p-4 text-left text-sm text-stone-800 shadow-xl sm:p-5">
          <h2 className="font-semibold text-base">Help us improve Perspective</h2>
          <p className="mt-2">Optional analytics help us understand usage and improve the experience. We do not send question or answer text to our product analytics service. You can use Perspective with analytics declined.</p>
          {choice !== "unset" && <p className="mt-2 text-xs">Current preference: {choice === "allowed" ? "Allowed" : "Declined"}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => choose("declined")} className="flex-1 rounded-lg border border-stone-500 bg-white px-4 py-2 font-medium">Decline</button>
            <button type="button" onClick={() => choose("allowed")} className="flex-1 rounded-lg border border-stone-500 bg-white px-4 py-2 font-medium">Allow analytics</button>
          </div>
          <button type="button" className="mt-3 underline underline-offset-4 text-xs" aria-expanded={notice} onClick={() => setNotice(!notice)}>Privacy notice</button>
          {choice !== "unset" && <button type="button" className="ml-4 text-xs underline" onClick={() => setOpen(false)}>Close</button>}
          {notice && <div className="mt-3 max-h-[40vh] overflow-auto space-y-2 text-xs leading-relaxed">
            <p>When allowed, PostHog receives pseudonymous browser and session identifiers, device and usage information, selected figures, answer timing and classification, ratings, and citation interactions. URL query strings and referrer paths are excluded from event properties by our client configuration. Analytics preferences are stored in your browser.</p>
            <p>Regardless of analytics preference, questions are sent to our backend and AI services to generate answers. If you submit feedback, the question, answer and rating are saved in our feedback database. Do not include confidential or sensitive personal information in questions.</p>
            <p>You can withdraw analytics consent here at any time. Withdrawal stops future analytics collection; it does not delete previously collected events.</p>
          </div>}
        </section>
      )}
    </footer>
  );
}
