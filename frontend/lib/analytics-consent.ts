import posthog from "posthog-js";

export type AnalyticsConsent = "allowed" | "declined" | "unset";
const KEY = "perspective.analytics-consent.v1";
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
let choice: AnalyticsConsent | undefined;
let initialized = false;

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unset";
  if (choice !== undefined) return choice;
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "allowed" || value === "declined" ? value : "unset";
  } catch { return "unset"; }
}

function safeLocation(value: unknown, originOnly: boolean): unknown {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return originOnly ? url.origin : url.origin + url.pathname;
  } catch { return undefined; }
}

function sanitize(properties: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const lower = key.toLowerCase();
    if (/utm_|gclid|fbclid|msclkid|ttclid|dclid|gbraid|wbraid|search_keyword|query_string/.test(lower)) continue;
    if (lower.includes("referrer") && !lower.includes("domain")) {
      clean[key] = safeLocation(value, true);
    } else if (lower.includes("url") || lower.includes("href")) {
      clean[key] = safeLocation(value, false);
    } else if (lower.includes("pathname") && typeof value === "string") {
      clean[key] = value.split(/[?#]/)[0];
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = sanitize(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function analyticsEnabled(): boolean {
  return initialized && getAnalyticsConsent() === "allowed";
}

export function initializeAnalytics(): void {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "allowed" || !token || !host) return;
  try {
    if (initialized) {
      posthog.opt_in_capturing();
    } else {
      posthog.init(token, {
        api_host: host,
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        disable_session_recording: true,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        capture_performance: false,
        disable_surveys: true,
        advanced_disable_feature_flags: true,
        person_profiles: "identified_only",
        persistence: "localStorage",
        opt_out_persistence_by_default: true,
        request_batching: false,
        before_send: (event) => {
          if (!event || getAnalyticsConsent() !== "allowed") return null;
          event.properties = {
            ...sanitize(event.properties ?? {}),
            environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
            app_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || "local",
            schema_version: 1,
            $geoip_disable: true,
          };
          return event;
        },
      });
      initialized = true;
      if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
    }
    posthog.capture("$pageview");
  } catch { console.warn("Analytics initialization failed"); }
}

export function setAnalyticsConsent(next: "allowed" | "declined"): boolean {
  choice = next;
  let saved = true;
  try { window.localStorage.setItem(KEY, next); } catch { saved = false; }
  if (next === "declined") {
    if (initialized) {
      try { posthog.opt_out_capturing(); } catch { console.warn("Analytics opt-out failed"); }
    }
  } else if (!analyticsEnabled()) {
    initializeAnalytics();
  } else if (posthog.has_opted_out_capturing()) {
    initializeAnalytics();
  }
  return saved;
}

// Apply consent withdrawal in other tabs. Do not begin collection in an
// already-open tab merely because consent was granted in another tab.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      choice = undefined;
      if (getAnalyticsConsent() !== "allowed" && initialized) {
        try { posthog.opt_out_capturing(); } catch { /* fail closed via before_send */ }
      }
    }
  });
}
