// ---- src/modal.tsx ----
// Single-step feedback form.
// Required: title, description.
// Optional media: screenshot (crop + annotate) | screen recording | file attachment.
// Everything else (category, OS, device, URL, timestamp) is auto-detected.

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { submitFeedback } from "./api";
import { FeedbackCategory, MediaType, SDKConfig } from "./types";
import { captureFullScreen, startRecording } from "./capture";
import { Screenshotter } from "./screenshotter";

type ModalState =
  | "idle"
  | "capturing"
  | "recording"
  | "submitting"
  | "success"
  | "error";

interface ModalProps {
  config: SDKConfig;
  onClose: () => void;
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const BLUE = "#2563eb";
const BORDER = "#e5e7eb";

// ── Auto-detect category from text ──────────────────────────────────────────
function detectCategory(title: string, desc: string): FeedbackCategory {
  const text = `${title} ${desc}`.toLowerCase();
  const bugWords = [
    "bug",
    "error",
    "broken",
    "crash",
    "fail",
    "issue",
    "not working",
    "wrong",
    "glitch",
    "problem",
    "fix",
  ];
  const featureWords = [
    "feature",
    "add",
    "request",
    "improve",
    "enhancement",
    "wish",
    "would be nice",
    "suggest",
    "new",
    "allow",
    "support",
  ];
  const uxWords = [
    "ui",
    "ux",
    "design",
    "layout",
    "look",
    "feel",
    "confusing",
    "hard to",
    "difficult",
    "slow",
    "loading",
    "style",
    "color",
    "font",
  ];

  const bugScore = bugWords.filter((w) => text.includes(w)).length;
  const featureScore = featureWords.filter((w) => text.includes(w)).length;
  const uxScore = uxWords.filter((w) => text.includes(w)).length;

  const max = Math.max(bugScore, featureScore, uxScore);
  if (max === 0) return "Other";
  if (bugScore === max) return "Bug";
  if (featureScore === max) return "Feature";
  return "UX";
}

// ── Auto-detect device / OS ──────────────────────────────────────────────────
function detectDevice(): { deviceName: string; os_version: string } {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const deviceName = isMobile ? "Mobile" : "Desktop";
  let os_version = "Unknown";
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Windows NT ([\d.]+)/))) os_version = `Windows ${m[1]}`;
  else if ((m = ua.match(/Mac OS X ([\d_]+)/)))
    os_version = `macOS ${m[1].replace(/_/g, ".")}`;
  else if ((m = ua.match(/Android ([\d.]+)/))) os_version = `Android ${m[1]}`;
  else if ((m = ua.match(/OS ([\d_]+) like Mac/)))
    os_version = `iOS ${m[1].replace(/_/g, ".")}`;
  return { deviceName, os_version };
}

export function FeedbackModal({ config, onClose }: ModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("none");
  const [mediaDataUrl, setMediaDataUrl] = useState<string>("");
  const [attachmentName, setAttachmentName] = useState<string>("");
  const [recordingHandle, setRecordingHandle] = useState<{
    stop: () => void;
  } | null>(null);
  const [modalState, setModalState] = useState<ModalState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [visible, setVisible] = useState(false);
  // fullScreenDataUrl: held while screenshotter overlay is open
  const [fullScreenDataUrl, setFullScreenDataUrl] = useState<string>("");
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // screenshotter is open when we have a fullScreenDataUrl
  const screenshotterOpen = fullScreenDataUrl !== "";
  // recording overlay is shown while recording state is active
  const recordingOverlayOpen = modalState === "recording";

  // Fade-in on mount + auto-focus title
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    setTimeout(() => titleRef.current?.focus(), 80);
    return () => cancelAnimationFrame(id);
  }, []);

  // ESC to close (only when screenshotter is not open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        modalState !== "submitting" &&
        !screenshotterOpen
      )
        handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modalState, screenshotterOpen]);

  const handleClose = useCallback(() => {
    if (recordingHandle) recordingHandle.stop();
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose, recordingHandle]);

  // ── Screenshot: capture full screen → show screenshotter overlay ─────────

  const handleTakeScreenshot = useCallback(async () => {
    setModalState("capturing");
    try {
      const dataUrl = await captureFullScreen();
      // Hide modal, show screenshotter
      setFullScreenDataUrl(dataUrl);
    } catch (err: unknown) {
      if (!(err instanceof Error && err.message === "CANCELLED")) {
        setErrorMessage("Screenshot capture failed.");
        setModalState("error");
        return;
      }
    }
    setModalState("idle");
  }, []);

  const handleScreenshotterDone = useCallback((annotatedDataUrl: string) => {
    setFullScreenDataUrl("");
    setMediaDataUrl(annotatedDataUrl);
    setMediaType("screenshot");
    setModalState("idle");
  }, []);

  const handleScreenshotterCancel = useCallback(() => {
    setFullScreenDataUrl("");
    setModalState("idle");
  }, []);

  // ── Recording ─────────────────────────────────────────────────────────────

  const handleStartRecording = useCallback(async () => {
    setModalState("recording");
    try {
      const handle = await startRecording((dataUrl: string) => {
        setMediaDataUrl(dataUrl);
        setMediaType("recording");
        setRecordingHandle(null);
        setModalState("idle");
      });
      setRecordingHandle(handle);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "CANCELLED") {
        setModalState("idle");
      } else {
        setErrorMessage("Recording failed to start.");
        setModalState("error");
      }
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    if (recordingHandle) recordingHandle.stop();
  }, [recordingHandle]);

  // ── File attachment ────────────────────────────────────────────────────────

  const handleAttachment = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setMediaDataUrl(reader.result as string);
        setMediaType("attachment");
        setAttachmentName(file.name);
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const clearMedia = useCallback(() => {
    setMediaDataUrl("");
    setMediaType("none");
    setAttachmentName("");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      titleRef.current?.focus();
      return;
    }

    setModalState("submitting");
    setErrorMessage("");

    const { deviceName, os_version } = detectDevice();
    const category = detectCategory(title, description);

    try {
      await submitFeedback(config.apiUrl, {
        category,
        title: title.trim(),
        description: description.trim(),
        ...(mediaType === "screenshot" ? { screen_shot: mediaDataUrl } : {}),
        ...(mediaType === "recording" ? { recording: mediaDataUrl } : {}),
        ...(mediaType === "attachment"
          ? { attachment: mediaDataUrl, attachment_name: attachmentName }
          : {}),
        pageURL: window.location.href,
        deviceName,
        os_version,
        app_version: config.appVersion ?? "unknown",
        timestamp: new Date().toISOString(),
      });
      setModalState("success");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Submission failed. Please try again.";
      setErrorMessage(message);
      setModalState("error");
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const backdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 2147483645,
    fontFamily: FONT,
    // Hide modal while screenshotter or recording overlay is open
    opacity: screenshotterOpen || recordingOverlayOpen ? 0 : visible ? 1 : 0,
    pointerEvents: screenshotterOpen || recordingOverlayOpen ? "none" : "all",
    transition: "opacity 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "14px",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transform: visible
      ? "scale(1) translateY(0)"
      : "scale(0.96) translateY(12px)",
    transition: "transform 0.2s ease",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px 14px",
    borderBottom: `1px solid ${BORDER}`,
  };

  const bodyStyle: React.CSSProperties = {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    overflowY: "auto",
    maxHeight: "65vh",
  };

  const footerStyle: React.CSSProperties = {
    padding: "14px 20px",
    borderTop: `1px solid ${BORDER}`,
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "6px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: "14px",
    border: `1.5px solid ${BORDER}`,
    borderRadius: "8px",
    outline: "none",
    color: "#111827",
    background: "#fff",
    boxSizing: "border-box",
    fontFamily: FONT,
    transition: "border-color 0.15s",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: "vertical",
    minHeight: "90px",
  };

  const btnBase: React.CSSProperties = {
    padding: "9px 18px",
    fontSize: "14px",
    fontWeight: 600,
    borderRadius: "8px",
    cursor: "pointer",
    fontFamily: FONT,
    border: "none",
    transition: "background 0.15s",
  };

  const primaryBtn: React.CSSProperties = {
    ...btnBase,
    background: modalState === "submitting" ? "#93c5fd" : BLUE,
    color: "#fff",
    cursor: modalState === "submitting" ? "not-allowed" : "pointer",
    minWidth: "130px",
  };

  const outlineBtn: React.CSSProperties = {
    ...btnBase,
    background: "#fff",
    color: "#374151",
    border: `1.5px solid ${BORDER}`,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "#dc2626",
    padding: "8px 12px",
    background: "#fef2f2",
    borderRadius: "6px",
    border: "1px solid #fecaca",
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (modalState === "success") {
    return (
      <div style={backdropStyle}>
        <div
          style={{
            ...cardStyle,
            padding: "48px 40px",
            textAlign: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{ fontSize: "52px", marginBottom: "12px", color: "#22c55e" }}
          >
            ✓
          </div>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: "18px",
              fontWeight: 700,
              color: "#111827",
              fontFamily: FONT,
            }}
          >
            Feedback sent!
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "#6b7280",
              margin: "0 0 24px",
              fontFamily: FONT,
            }}
          >
            Thanks for helping us improve. We'll look into it shortly.
          </p>
          <button style={primaryBtn} onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Screenshotter overlay — portaled to body, above everything */}
      {screenshotterOpen &&
        createPortal(
          <Screenshotter
            fullScreenDataUrl={fullScreenDataUrl}
            onDone={handleScreenshotterDone}
            onCancel={handleScreenshotterCancel}
          />,
          document.body,
        )}

      {/* Recording stop bar — floats over the live page while recording */}
      {recordingOverlayOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2147483646,
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "10px 20px",
              borderRadius: "999px",
              background: "rgba(15,23,42,0.92)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
              fontFamily: FONT,
              backdropFilter: "blur(8px)",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#ef4444",
                display: "inline-block",
                animation: "fa-pulse 1s ease infinite",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
              Recording in progress…
            </span>
            <button
              onClick={handleStopRecording}
              style={{
                padding: "6px 16px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 999,
                border: "none",
                background: "#ef4444",
                color: "#fff",
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Stop
            </button>
          </div>,
          document.body,
        )}

      {/* Main modal form */}
      <div
        style={backdropStyle}
        onClick={(e) => {
          if (e.target === e.currentTarget && modalState !== "submitting")
            handleClose();
        }}
      >
        <div
          style={cardStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Feedback"
        >
          {/* Header */}
          <div style={headerStyle}>
            <div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#111827",
                  fontFamily: FONT,
                }}
              >
                Share Feedback
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#9ca3af",
                  marginTop: "2px",
                  fontFamily: FONT,
                }}
              >
                Help us improve your experience
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#9ca3af",
                fontSize: "22px",
                lineHeight: 1,
                padding: "2px 6px",
                borderRadius: "4px",
              }}
              title="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div style={bodyStyle}>
              {/* Title */}
              <div>
                <label style={labelStyle} htmlFor="fa-title">
                  Title <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  id="fa-title"
                  ref={titleRef}
                  style={inputStyle}
                  type="text"
                  placeholder="Brief summary of your feedback"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={modalState === "submitting"}
                  maxLength={120}
                  required
                  onFocus={(e) => (e.target.style.borderColor = BLUE)}
                  onBlur={(e) => (e.target.style.borderColor = BORDER)}
                />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle} htmlFor="fa-desc">
                  Description <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  id="fa-desc"
                  style={textareaStyle}
                  placeholder="What happened? What did you expect?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={modalState === "submitting"}
                  maxLength={2000}
                  required
                  onFocus={(e) => (e.target.style.borderColor = BLUE)}
                  onBlur={(e) => (e.target.style.borderColor = BORDER)}
                />
              </div>

              {/* ── Media picker ── */}
              <div>
                <label style={labelStyle}>
                  Attach media{" "}
                  <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                    (optional)
                  </span>
                </label>

                {/* Option buttons — shown when no media yet */}
                {mediaType === "none" && (
                  <div
                    style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
                  >
                    <MediaOptionBtn
                      icon="📷"
                      label="Screenshot"
                      loading={modalState === "capturing"}
                      disabled={modalState === "submitting"}
                      onClick={handleTakeScreenshot}
                    />
                    <MediaOptionBtn
                      icon="🎥"
                      label="Record Screen"
                      disabled={
                        modalState === "submitting" ||
                        modalState === "capturing"
                      }
                      onClick={handleStartRecording}
                    />
                    <MediaOptionBtn
                      icon="📎"
                      label="Attach File"
                      disabled={
                        modalState === "submitting" ||
                        modalState === "capturing"
                      }
                      onClick={handleAttachment}
                    />
                    <input
                      ref={fileRef}
                      type="file"
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />
                  </div>
                )}

                {/* Media preview */}
                {mediaType !== "none" && (
                  <MediaPreview
                    type={mediaType}
                    dataUrl={mediaDataUrl}
                    fileName={attachmentName}
                    onClear={clearMedia}
                  />
                )}
              </div>

              {/* Auto-detect notice */}
              <div
                style={{
                  fontSize: "12px",
                  color: "#9ca3af",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>✦</span>
                <span>
                  Category, device info and page URL are detected automatically.
                </span>
              </div>

              {/* Error */}
              {modalState === "error" && (
                <div style={errorStyle} role="alert">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={footerStyle}>
              <button
                type="button"
                style={outlineBtn}
                onClick={handleClose}
                disabled={modalState === "submitting"}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={primaryBtn}
                disabled={modalState === "submitting"}
              >
                {modalState === "submitting" ? "Sending…" : "Submit Feedback"}
              </button>
            </div>
          </form>
        </div>

        <style>{`@keyframes fa-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    </>
  );
}

// ── MediaOptionBtn ─────────────────────────────────────────────────────────────

function MediaOptionBtn({
  icon,
  label,
  loading,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        padding: "12px 16px",
        border: "1.5px solid #e5e7eb",
        borderRadius: "10px",
        background: disabled ? "#f9fafb" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        transition: "border-color 0.15s",
        minWidth: "90px",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading)
          e.currentTarget.style.borderColor = "#2563eb";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
      }}
    >
      <span style={{ fontSize: "22px" }}>{loading ? "⏳" : icon}</span>
      <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>
        {loading ? "Capturing…" : label}
      </span>
    </button>
  );
}

// ── MediaPreview ────────────────────────────────────────────────────────────────

function MediaPreview({
  type,
  dataUrl,
  fileName,
  onClear,
}: {
  type: MediaType;
  dataUrl: string;
  fileName: string;
  onClear: () => void;
}) {
  const wrapStyle: React.CSSProperties = {
    position: "relative",
    border: "1.5px solid #e5e7eb",
    borderRadius: "10px",
    overflow: "hidden",
    background: "#f9fafb",
    marginTop: "10px",
  };
  const clearBtn = (
    <button
      type="button"
      onClick={onClear}
      title="Remove"
      style={{
        position: "absolute",
        top: "8px",
        right: "8px",
        background: "rgba(0,0,0,0.55)",
        border: "none",
        borderRadius: "50%",
        color: "#fff",
        width: "26px",
        height: "26px",
        cursor: "pointer",
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      ×
    </button>
  );

  if (type === "screenshot")
    return (
      <div style={wrapStyle}>
        <img
          src={dataUrl}
          alt="Screenshot preview"
          style={{
            display: "block",
            width: "100%",
            maxHeight: "180px",
            objectFit: "cover",
          }}
        />
        {clearBtn}
      </div>
    );

  if (type === "recording")
    return (
      <div style={wrapStyle}>
        <video
          src={dataUrl}
          controls
          style={{ display: "block", width: "100%", maxHeight: "180px" }}
        />
        {clearBtn}
      </div>
    );

  if (type === "attachment")
    return (
      <div
        style={{
          ...wrapStyle,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px 14px",
        }}
      >
        <span style={{ fontSize: "24px" }}>📎</span>
        <span
          style={{
            fontSize: "13px",
            color: "#374151",
            fontFamily: "-apple-system, sans-serif",
            wordBreak: "break-all",
          }}
        >
          {fileName}
        </span>
        {clearBtn}
      </div>
    );

  return null;
}
