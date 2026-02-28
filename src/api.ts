import { FeedbackPayload } from "./types";

export async function submitFeedback(
  apiUrl: string,
  feedback: FeedbackPayload,
): Promise<void> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedback),
  });

  if (!res.ok) {
    throw new Error(`Server responded with ${res.status}: ${res.statusText}`);
  }
}
