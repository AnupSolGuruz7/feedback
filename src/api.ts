// ---- src/api.ts ----
// Pure submission function. Uses fetch (built into all modern browsers) —
// avoids pulling in Axios and its Node.js built-in dependencies (util, stream, etc.)
// which break IIFE/CDN builds.

import { FeedbackPayload, SubmitPayload } from "./types";

export async function submitFeedback(
  apiUrl: string,
  apiKey: string,
  projectId: string,
  feedback: FeedbackPayload
): Promise<void> {
  const payload: SubmitPayload = {
    apiKey,
    projectId,
    feedback,
  };

  const res = await fetch(`${apiUrl}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Server responded with ${res.status}: ${res.statusText}`);
  }
}
