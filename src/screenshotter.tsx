// ---- src/screenshotter.tsx ----
// Full-screen crop + annotate overlay.
//
// Flow:
//   1. Receives a full-screen dataUrl (already captured via getDisplayMedia).
//   2. Shows it behind a semi-transparent dark mask.
//   3. User drags to select a region — the selected rect is "cut out" of the mask
//      so it appears bright/clear.
//   4. On "Confirm" the cropped region is passed to the annotation canvas.
//   5. User annotates, then clicks "Done" → onDone(annotatedDataUrl) is called.
//   6. On any cancel → onCancel() is called.

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { AnnotationCanvas, AnnotatorHandle } from "./annotator";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

interface Rect { x: number; y: number; w: number; h: number }

interface ScreenshotterProps {
  fullScreenDataUrl: string;
  onDone: (annotatedDataUrl: string) => void;
  onCancel: () => void;
}

type Phase = "crop" | "annotate";

export function Screenshotter({ fullScreenDataUrl, onDone, onCancel }: ScreenshotterProps) {
  const [phase, setPhase] = useState<Phase>("crop");
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [croppedDataUrl, setCroppedDataUrl] = useState<string>("");
  const annotatorRef = useRef<AnnotatorHandle>(null);

  // ── Crop phase ───────────────────────────────────────────────────────────────

  const handleCropConfirm = useCallback((rect: Rect) => {
    // Crop the full-screen image to the selected rect
    const img = new Image();
    img.onload = () => {
      // The overlay uses CSS to fill the viewport, so we scale from CSS pixels → image pixels
      const scaleX = img.naturalWidth / window.innerWidth;
      const scaleY = img.naturalHeight / window.innerHeight;

      const sx = rect.x * scaleX;
      const sy = rect.y * scaleY;
      const sw = rect.w * scaleX;
      const sh = rect.h * scaleY;

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      setCroppedDataUrl(canvas.toDataURL("image/png"));
      setCropRect(rect);
      setPhase("annotate");
    };
    img.src = fullScreenDataUrl;
  }, [fullScreenDataUrl]);

  // ── Annotate phase ───────────────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    const url = annotatorRef.current?.getAnnotatedDataUrl() ?? croppedDataUrl;
    onDone(url);
  }, [croppedDataUrl, onDone]);

  // ESC cancels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  // ── Styles ───────────────────────────────────────────────────────────────────

  const overlayBase: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 2147483646,
    fontFamily: FONT,
    userSelect: "none",
  };

  if (phase === "crop") {
    return (
      <CropOverlay
        imageUrl={fullScreenDataUrl}
        onConfirm={handleCropConfirm}
        onCancel={onCancel}
        style={overlayBase}
      />
    );
  }

  // Annotate phase — full-screen dark backdrop with annotation canvas centered
  return (
    <div style={{ ...overlayBase, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", background: "#0f172a", borderBottom: "1px solid #1e293b", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>Annotate</span>
          <span style={{ fontSize: "12px", color: "#64748b", background: "#1e293b", padding: "2px 8px", borderRadius: "999px" }}>
            Draw on the screenshot to highlight the issue
          </span>
        </div>
        <button
          onClick={onCancel}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: "22px", cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}
          title="Cancel"
        >×</button>
      </div>

      {/* Canvas scroll area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "1000px" }}>
          <AnnotationCanvas ref={annotatorRef} screenshotDataUrl={croppedDataUrl} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px",
        padding: "12px 20px", background: "#0f172a", borderTop: "1px solid #1e293b", flexShrink: 0,
      }}>
        <button
          onClick={onCancel}
          style={{ padding: "8px 18px", fontSize: "14px", fontWeight: 600, borderRadius: "7px", border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer", fontFamily: FONT }}
        >
          Cancel
        </button>
        <button
          onClick={handleDone}
          style={{ padding: "8px 20px", fontSize: "14px", fontWeight: 600, borderRadius: "7px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontFamily: FONT }}
        >
          Use this screenshot →
        </button>
      </div>
    </div>
  );
}

// ── CropOverlay ───────────────────────────────────────────────────────────────
// Shows the full-screen image with a darkened mask.
// Drag to select the crop region — the selected area is shown without the mask.

interface CropOverlayProps {
  imageUrl: string;
  onConfirm: (rect: Rect) => void;
  onCancel: () => void;
  style: React.CSSProperties;
}

function CropOverlay({ imageUrl, onConfirm, onCancel, style }: CropOverlayProps) {
  const [drag, setDrag] = useState<{ startX: number; startY: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toRect = (ax: number, ay: number, bx: number, by: number): Rect => ({
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  });

  const getXY = (e: React.MouseEvent | React.TouchEvent) => {
    const container = containerRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: t.clientX - container.left, y: t.clientY - container.top };
    }
    return { x: (e as React.MouseEvent).clientX - container.left, y: (e as React.MouseEvent).clientY - container.top };
  };

  const onPointerDown = (e: React.MouseEvent) => {
    const { x, y } = getXY(e);
    setDrag({ startX: x, startY: y });
    setRect(null);
    setConfirmed(false);
  };

  const onPointerMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = getXY(e);
    setRect(toRect(drag.startX, drag.startY, x, y));
  };

  const onPointerUp = () => {
    setDrag(null);
    if (rect && rect.w > 10 && rect.h > 10) {
      setConfirmed(true);
    }
  };

  const hasRect = rect && rect.w > 10 && rect.h > 10;

  return (
    <div
      ref={containerRef}
      style={{
        ...style,
        cursor: drag ? "crosshair" : "crosshair",
        overflow: "hidden",
      }}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
    >
      {/* Full-screen background image */}
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />

      {/* Dark mask — four rects surrounding the selection */}
      <MaskLayer rect={rect} />

      {/* Selection border */}
      {hasRect && (
        <div style={{
          position: "absolute",
          left: rect!.x, top: rect!.y, width: rect!.w, height: rect!.h,
          border: "2px solid #fff",
          boxSizing: "border-box",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}>
          {/* Corner handles */}
          {[
            { top: -4, left: -4 }, { top: -4, right: -4 },
            { bottom: -4, left: -4 }, { bottom: -4, right: -4 },
          ].map((s, i) => (
            <div key={i} style={{ position: "absolute", width: 8, height: 8, background: "#fff", borderRadius: 2, ...s }} />
          ))}

          {/* Size label */}
          <div style={{
            position: "absolute", bottom: "100%", left: 0, marginBottom: 4,
            background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 11,
            padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", fontFamily: FONT,
          }}>
            {Math.round(rect!.w)} × {Math.round(rect!.h)}
          </div>
        </div>
      )}

      {/* Top instruction bar */}
      {!confirmed && (
        <div style={{
          position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.72)", color: "#fff", padding: "8px 20px",
          borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: FONT,
          pointerEvents: "none", whiteSpace: "nowrap",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}>
          {hasRect ? "Release to confirm selection" : "Click and drag to select an area"}
        </div>
      )}

      {/* Confirm / Redo buttons — shown after drag ends */}
      {confirmed && hasRect && (
        <div style={{
          position: "absolute",
          left: rect!.x + rect!.w / 2,
          top: rect!.y + rect!.h + 12,
          transform: "translateX(-50%)",
          display: "flex", gap: 8,
          pointerEvents: "all",
        }}>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setRect(null); setConfirmed(false); }}
            style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontFamily: FONT }}
          >
            Redo
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onConfirm(rect!); }}
            style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontFamily: FONT }}
          >
            Annotate →
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            style={{ padding: "7px 14px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontFamily: FONT }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── MaskLayer ─────────────────────────────────────────────────────────────────
// Renders four dark rectangles that surround the selected crop region,
// making the selected area appear unobscured.

function MaskLayer({ rect }: { rect: Rect | null }) {
  const maskColor = "rgba(0,0,0,0.55)";
  const vw = "100vw";
  const vh = "100vh";

  if (!rect || rect.w <= 0 || rect.h <= 0) {
    return <div style={{ position: "absolute", inset: 0, background: maskColor, pointerEvents: "none" }} />;
  }

  const { x, y, w, h } = rect;

  return (
    <>
      {/* Top */}
      <div style={{ position: "absolute", left: 0, top: 0, width: vw, height: y, background: maskColor, pointerEvents: "none" }} />
      {/* Bottom */}
      <div style={{ position: "absolute", left: 0, top: y + h, width: vw, height: `calc(${vh} - ${y + h}px)`, background: maskColor, pointerEvents: "none" }} />
      {/* Left */}
      <div style={{ position: "absolute", left: 0, top: y, width: x, height: h, background: maskColor, pointerEvents: "none" }} />
      {/* Right */}
      <div style={{ position: "absolute", left: x + w, top: y, width: `calc(${vw} - ${x + w}px)`, height: h, background: maskColor, pointerEvents: "none" }} />
    </>
  );
}
