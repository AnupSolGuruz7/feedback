// ---- src/sdk.ts ----
// Orchestrator: mounts launcher + modal.
// Modal opens immediately on button click — no pre-capture.
// Screenshot/recording/attachment are triggered from inside the modal.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { SDKConfig } from "./types";
import { Launcher } from "./launcher";
import { FeedbackModal } from "./modal";
import {
  isInitialized,
  markInitialized,
  getConfig,
  setConfig,
  getLauncherRoot,
  setLauncherRoot,
  getModalRoot,
  setModalRoot,
  resetState,
} from "./state";

export const VERSION = "1.0.0";

let launcherReactRoot: Root | null = null;
let modalReactRoot: Root | null = null;

function validateConfig(config: SDKConfig): void {
  if (!config.apiKey) throw new Error("[FeedbackAgent] apiKey is required.");
  if (!config.projectId) throw new Error("[FeedbackAgent] projectId is required.");
  if (!config.apiUrl) throw new Error("[FeedbackAgent] apiUrl is required.");
}

function createHostDiv(id: string): HTMLElement {
  const div = document.createElement("div");
  div.id = id;
  div.style.cssText = "all:initial;position:fixed;z-index:2147483647;font-size:16px;";
  document.body.appendChild(div);
  return div;
}

function mountLauncher(config: SDKConfig): void {
  const container = createHostDiv("__feedback_agent_launcher__");
  setLauncherRoot(container);
  launcherReactRoot = createRoot(container);
  launcherReactRoot.render(
    React.createElement(Launcher, { config, onTrigger: handleLauncherClick })
  );
}

function handleLauncherClick(): void {
  // Guard: don't open a second modal if one is already mounted
  if (getModalRoot()) return;

  const config = getConfig();
  const container = createHostDiv("__feedback_agent_modal__");
  setModalRoot(container);

  modalReactRoot = createRoot(container);

  function unmountModal() {
    if (modalReactRoot) {
      modalReactRoot.unmount();
      modalReactRoot = null;
    }
    const el = getModalRoot();
    if (el) {
      el.remove();
      setModalRoot(null);
    }
  }

  modalReactRoot.render(
    React.createElement(FeedbackModal, { config, onClose: unmountModal })
  );
}

export function init(config: SDKConfig): void {
  if (isInitialized()) {
    console.warn("[FeedbackAgent] Already initialized. Call destroy() first to re-init.");
    return;
  }
  validateConfig(config);
  const resolvedConfig: SDKConfig = { position: "bottom-right", ...config };
  setConfig(resolvedConfig);
  markInitialized();
  mountLauncher(resolvedConfig);
}

export function destroy(): void {
  if (modalReactRoot) { modalReactRoot.unmount(); modalReactRoot = null; }
  const modalEl = getModalRoot();
  if (modalEl) modalEl.remove();

  if (launcherReactRoot) { launcherReactRoot.unmount(); launcherReactRoot = null; }
  const launcherEl = getLauncherRoot();
  if (launcherEl) launcherEl.remove();

  resetState();
}
