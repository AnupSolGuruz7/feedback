// ---- src/launcher.tsx ----
// Floating feedback button injected into the host page.
// Uses inline styles exclusively — no Tailwind, no CSS files, no host style contamination.

import React, { useState } from "react";
import { SDKConfig } from "./types";

interface LauncherProps {
  config: SDKConfig;
  onTrigger: () => void;
}

// Camera/feedback SVG icon
function FeedbackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function Launcher({ config, onTrigger }: LauncherProps) {
  const [hovered, setHovered] = useState(false);

  const isLeft = config.position === "bottom-left";

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    bottom: "24px",
    ...(isLeft ? { left: "24px" } : { right: "24px" }),
    zIndex: 2147483647,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 18px",
    background: hovered ? "#1a56db" : "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "9999px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    letterSpacing: "0.01em",
    boxShadow: hovered
      ? "0 8px 24px rgba(37,99,235,0.55)"
      : "0 4px 14px rgba(37,99,235,0.4)",
    transform: hovered ? "translateY(-2px) scale(1.03)" : "translateY(0) scale(1)",
    transition: "all 0.18s ease",
    userSelect: "none",
    outline: "none",
    whiteSpace: "nowrap",
  };

  return (
    <div style={containerStyle}>
      <button
        style={buttonStyle}
        onClick={onTrigger}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Open feedback widget"
        title="Share feedback"
      >
        <FeedbackIcon />
        Feedback
      </button>
    </div>
  );
}
