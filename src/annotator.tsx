// ---- src/annotator.tsx ----
// Canvas-based annotation layer rendered on top of the screenshot.
// Tools: rectangle, arrow, freehand, text. Color picker included.
// Exports getAnnotatedDataUrl() to flatten screenshot + annotations into one image.

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";

export type AnnotationTool = "rect" | "arrow" | "freehand" | "text";

export interface AnnotatorHandle {
  getAnnotatedDataUrl: () => string;
}

interface Point {
  x: number;
  y: number;
}

interface Annotation {
  tool: AnnotationTool;
  color: string;
  points: Point[];   // [start, end] for rect/arrow; path for freehand; [pos] for text
  text?: string;
}

interface AnnotatorProps {
  screenshotDataUrl: string;
}

const PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000", "#ffffff"];
const STROKE_WIDTH = 3;
const ARROW_HEAD = 12;

function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (ann.tool) {
    case "rect": {
      if (ann.points.length < 2) break;
      const [s, e] = ann.points;
      ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
      // Semi-transparent fill
      ctx.globalAlpha = 0.12;
      ctx.fillRect(s.x, s.y, e.x - s.x, e.y - s.y);
      break;
    }
    case "arrow": {
      if (ann.points.length < 2) break;
      const [s, e] = ann.points;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(e.y - s.y, e.x - s.x);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x - ARROW_HEAD * Math.cos(angle - Math.PI / 6), e.y - ARROW_HEAD * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(e.x - ARROW_HEAD * Math.cos(angle + Math.PI / 6), e.y - ARROW_HEAD * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "freehand": {
      if (ann.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      ctx.stroke();
      break;
    }
    case "text": {
      if (!ann.text || ann.points.length < 1) break;
      ctx.font = `bold 16px -apple-system, sans-serif`;
      // Shadow for readability on any background
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 3;
      ctx.fillText(ann.text, ann.points[0].x, ann.points[0].y);
      break;
    }
  }
  ctx.restore();
}

function redraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  annotations: Annotation[],
  current: Annotation | null
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
  annotations.forEach((a) => drawAnnotation(ctx, a));
  if (current) drawAnnotation(ctx, current);
}

export const AnnotationCanvas = forwardRef<AnnotatorHandle, AnnotatorProps>(
  ({ screenshotDataUrl }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [tool, setTool] = useState<AnnotationTool>("rect");
    const [color, setColor] = useState("#ef4444");
    const [drawing, setDrawing] = useState(false);
    const [current, setCurrent] = useState<Annotation | null>(null);
    const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
    const [textInput, setTextInput] = useState("");
    const textInputRef = useRef<HTMLInputElement>(null);

    // Load screenshot into canvas
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        // Fit canvas to container width while preserving aspect ratio
        const containerWidth = canvas.parentElement?.clientWidth ?? 480;
        const scale = containerWidth / img.naturalWidth;
        canvas.width = containerWidth;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = screenshotDataUrl;
    }, [screenshotDataUrl]);

    // Re-render on annotation changes
    useEffect(() => {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext("2d")!;
      redraw(ctx, img, annotations, current);
    }, [annotations, current]);

    // Focus text input when pending
    useEffect(() => {
      if (pendingText) setTimeout(() => textInputRef.current?.focus(), 50);
    }, [pendingText]);

    const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const scaleX = canvasRef.current!.width / rect.width;
      const scaleY = canvasRef.current!.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }, []);

    const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tool === "text") {
        const pos = getPos(e);
        setPendingText(pos);
        setTextInput("");
        return;
      }
      const pos = getPos(e);
      setDrawing(true);
      setCurrent({ tool, color, points: [pos, pos] });
    }, [tool, color, getPos]);

    const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawing || !current) return;
      const pos = getPos(e);
      setCurrent((prev) => {
        if (!prev) return prev;
        if (prev.tool === "freehand") {
          return { ...prev, points: [...prev.points, pos] };
        }
        // rect / arrow: update endpoint
        return { ...prev, points: [prev.points[0], pos] };
      });
    }, [drawing, current, getPos]);

    const onMouseUp = useCallback(() => {
      if (!drawing || !current) return;
      setDrawing(false);
      setAnnotations((prev) => [...prev, current]);
      setCurrent(null);
    }, [drawing, current]);

    const commitText = useCallback(() => {
      if (!pendingText || !textInput.trim()) {
        setPendingText(null);
        return;
      }
      setAnnotations((prev) => [
        ...prev,
        { tool: "text", color, points: [pendingText], text: textInput.trim() },
      ]);
      setPendingText(null);
      setTextInput("");
    }, [pendingText, textInput, color]);

    const undo = useCallback(() => {
      setAnnotations((prev) => prev.slice(0, -1));
    }, []);

    const clear = useCallback(() => {
      setAnnotations([]);
    }, []);

    // Expose flattened canvas as data URL to parent
    useImperativeHandle(ref, () => ({
      getAnnotatedDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? screenshotDataUrl,
    }));

    // ---- Toolbar styles ----
    const toolbarStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "8px 10px",
      background: "#1e293b",
      borderRadius: "8px 8px 0 0",
      flexWrap: "wrap",
    };

    const toolBtnStyle = (active: boolean): React.CSSProperties => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "32px",
      height: "32px",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
      background: active ? "#3b82f6" : "#334155",
      color: "#fff",
      fontSize: "14px",
      transition: "background 0.12s",
      title: "",
    });

    const divider: React.CSSProperties = {
      width: "1px",
      height: "24px",
      background: "#475569",
      margin: "0 2px",
    };

    const actionBtnStyle: React.CSSProperties = {
      padding: "4px 10px",
      fontSize: "12px",
      fontWeight: 600,
      borderRadius: "5px",
      border: "none",
      cursor: "pointer",
      background: "#334155",
      color: "#94a3b8",
    };

    return (
      <div style={{ position: "relative", userSelect: "none" }}>
        {/* Toolbar */}
        <div style={toolbarStyle}>
          {/* Tool buttons */}
          <button style={toolBtnStyle(tool === "rect")} onClick={() => setTool("rect")} title="Rectangle">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="2" width="12" height="12" rx="1" />
            </svg>
          </button>
          <button style={toolBtnStyle(tool === "arrow")} onClick={() => setTool("arrow")} title="Arrow">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <line x1="3" y1="13" x2="13" y2="3" />
              <polyline points="7,3 13,3 13,9" />
            </svg>
          </button>
          <button style={toolBtnStyle(tool === "freehand")} onClick={() => setTool("freehand")} title="Freehand">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 12 Q4 6 8 8 Q12 10 14 4" strokeLinecap="round" />
            </svg>
          </button>
          <button style={toolBtnStyle(tool === "text")} onClick={() => setTool("text")} title="Text">
            <span style={{ fontWeight: 700, fontSize: "13px" }}>T</span>
          </button>

          <div style={divider} />

          {/* Color presets */}
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: color === c ? "2.5px solid #fff" : "2px solid transparent",
                background: c,
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                boxShadow: color === c ? "0 0 0 1px #3b82f6" : "none",
              }}
            />
          ))}

          {/* Custom color picker */}
          <label title="Custom color" style={{ cursor: "pointer", width: "24px", height: "24px", borderRadius: "4px", overflow: "hidden", border: "1.5px solid #475569", flexShrink: 0 }}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: "32px", height: "32px", border: "none", padding: 0, cursor: "pointer", marginLeft: "-4px", marginTop: "-4px" }}
            />
          </label>

          <div style={divider} />

          {/* Undo / Clear */}
          <button style={actionBtnStyle} onClick={undo} title="Undo" disabled={annotations.length === 0}>
            Undo
          </button>
          <button style={actionBtnStyle} onClick={clear} title="Clear all" disabled={annotations.length === 0}>
            Clear
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            cursor: tool === "text" ? "text" : "crosshair",
            borderRadius: "0 0 6px 6px",
            border: `1px solid #e5e7eb`,
            borderTop: "none",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />

        {/* Floating text input — appears where user clicked */}
        {pendingText && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "#1e293b",
                borderRadius: "8px",
                padding: "12px 16px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                pointerEvents: "all",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <input
                ref={textInputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") setPendingText(null);
                }}
                placeholder="Type annotation..."
                style={{
                  background: "#334155",
                  border: "1px solid #475569",
                  borderRadius: "5px",
                  color: "#fff",
                  padding: "6px 10px",
                  fontSize: "13px",
                  outline: "none",
                  width: "200px",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={commitText}
                style={{ background: "#3b82f6", border: "none", borderRadius: "5px", color: "#fff", padding: "6px 12px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
              >
                Add
              </button>
              <button
                onClick={() => setPendingText(null)}
                style={{ background: "#475569", border: "none", borderRadius: "5px", color: "#fff", padding: "6px 10px", cursor: "pointer", fontSize: "13px" }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

AnnotationCanvas.displayName = "AnnotationCanvas";
