// ---- src/index.ts ----
// Public entry point.
// Exports the FeedbackAgent object for ESM/CJS usage.
// For IIFE (CDN), tsup sets globalName: "FeedbackAgent" and the footer shim
// flattens window.FeedbackAgent.default → window.FeedbackAgent.

import { init, destroy, VERSION } from "./sdk";
import type { SDKConfig, FeedbackAgentAPI } from "./types";

const FeedbackAgent: FeedbackAgentAPI = {
  init,
  destroy,
  get version() {
    return VERSION;
  },
};

// Ensure window.FeedbackAgent is available even in ESM contexts
// (e.g. when loaded via <script type="module">)
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["FeedbackAgent"] = FeedbackAgent;
}

export default FeedbackAgent;
export { init, destroy, VERSION };
export type { SDKConfig, FeedbackAgentAPI };
