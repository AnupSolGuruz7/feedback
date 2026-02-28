// ---- src/state.ts ----
// Simple internal singleton — no Redux, no global pollution beyond window.FeedbackAgent

import { SDKConfig } from "./types";

interface InternalState {
  config: SDKConfig | null;
  initialized: boolean;
  launcherRoot: HTMLElement | null;
  modalRoot: HTMLElement | null;
}

const state: InternalState = {
  config: null,
  initialized: false,
  launcherRoot: null,
  modalRoot: null,
};

export function getConfig(): SDKConfig {
  if (!state.config) throw new Error("[FeedbackAgent] SDK not initialized.");
  return state.config;
}

export function setConfig(config: SDKConfig): void {
  state.config = config;
}

export function isInitialized(): boolean {
  return state.initialized;
}

export function markInitialized(): void {
  state.initialized = true;
}

export function getLauncherRoot(): HTMLElement | null {
  return state.launcherRoot;
}

export function setLauncherRoot(el: HTMLElement | null): void {
  state.launcherRoot = el;
}

export function getModalRoot(): HTMLElement | null {
  return state.modalRoot;
}

export function setModalRoot(el: HTMLElement | null): void {
  state.modalRoot = el;
}

export function resetState(): void {
  state.config = null;
  state.initialized = false;
  state.launcherRoot = null;
  state.modalRoot = null;
}
