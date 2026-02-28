// ---- src/types.ts ----

export interface SDKConfig {
  apiKey: string;
  projectId: string;
  apiUrl: string;
  position?: "bottom-right" | "bottom-left";
  appVersion?: string;
}

// Auto-detected from title + description keywords
export type FeedbackCategory = "Bug" | "Feature" | "UX" | "Other";

export type MediaType = "screenshot" | "recording" | "attachment" | "none";

export interface FeedbackPayload {
  category: FeedbackCategory;        // auto-detected
  title: string;
  description: string;
  // Media — at most one will be present
  screen_shot?: string;              // base64 dataUrl PNG
  recording?: string;                // base64 dataUrl WebM
  attachment?: string;               // base64 dataUrl (any file)
  attachment_name?: string;          // original filename
  // Auto-detected — never shown in form
  pageURL: string;
  deviceName: string;
  os_version: string;
  app_version: string;
  timestamp: string;
}

export interface SubmitPayload {
  apiKey: string;
  projectId: string;
  feedback: FeedbackPayload;
}

export interface FeedbackAgentAPI {
  init(config: SDKConfig): void;
  destroy(): void;
  readonly version: string;
}
