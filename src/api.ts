import { FeedbackPayload } from "./types";

export async function uploadMedia(
  apiUrl: string,
  dataUrl: string,
  fileName?: string,
): Promise<string> {
  // Convert base64 dataUrl to Blob
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });

  const ext = mime.split("/")[1]?.split(";")[0] ?? "bin";
  const name = fileName ?? `upload.${ext}`;

  const form = new FormData();
  form.append("file", blob, name);

  const res = await fetch(`${apiUrl}/api/v1/upload/widget/screenshot`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Upload failed with ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();

  if (!json.data.url) throw new Error("Upload response missing url");
  return json.data.url as string;
}

export async function submitFeedback(
  apiUrl: string,
  feedback: FeedbackPayload,
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/v1/widget/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedback),
  });

  if (!res.ok) {
    throw new Error(`Server responded with ${res.status}: ${res.statusText}`);
  }
}
