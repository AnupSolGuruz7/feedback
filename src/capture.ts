// ---- src/capture.ts ----
// Two on-demand capture helpers used by the modal:
//   captureScreenshot() — grabs one frame via getDisplayMedia → PNG dataUrl
//   startRecording()    — records via getDisplayMedia → WebM dataUrl on stop

const SDK_ELEMENT_IDS = [
  "__feedback_agent_launcher__",
  "__feedback_agent_loader__",
  "__feedback_agent_modal__",
];

type Saved = { el: HTMLElement; visibility: string };

function hideSdkElements(): Saved[] {
  return SDK_ELEMENT_IDS.flatMap((id) => {
    const el = document.getElementById(id);
    if (!el) return [];
    const visibility = el.style.visibility;
    el.style.visibility = "hidden";
    return [{ el, visibility }];
  });
}

function restoreElements(saved: Saved[]): void {
  saved.forEach(({ el, visibility }) => {
    el.style.visibility = visibility;
  });
}

function getDisplayStream(): Promise<MediaStream> {
  return (navigator.mediaDevices as MediaDevices & {
    getDisplayMedia(opts?: DisplayMediaStreamOptions & { preferCurrentTab?: boolean }): Promise<MediaStream>;
  }).getDisplayMedia({
    video: {
      // @ts-ignore — "browser" is valid in Chrome 107+
      displaySurface: "browser",
      frameRate: 30,
    } as MediaTrackConstraints,
    audio: false,
    // @ts-ignore — Chrome 112+ pre-selects current tab
    preferCurrentTab: true,
  });
}

// ── Full-screen capture (raw, no crop) ───────────────────────────────────────
// Used by the screenshotter overlay to get the base image for cropping.

export async function captureFullScreen(): Promise<string> {
  const savedSdk = hideSdkElements();

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

  let stream: MediaStream | null = null;
  let dataUrl: string;

  try {
    stream = await getDisplayStream();
    dataUrl = await new Promise<string>((resolve, reject) => {
      const video = document.createElement("video");
      video.srcObject = stream!;
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        video.play().then(() => {
          requestAnimationFrame(() => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext("2d")!.drawImage(video, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          });
        }).catch(reject);
      };
      video.onerror = reject;
    });
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === "NotAllowedError") throw new Error("CANCELLED");
    throw err;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    restoreElements(savedSdk);
  }

  return dataUrl;
}

// ── Screenshot (legacy full-viewport, kept for compat) ────────────────────────

export async function captureScreenshot(): Promise<string> {
  const savedSdk = hideSdkElements();

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

  let stream: MediaStream | null = null;
  let dataUrl: string;

  try {
    stream = await getDisplayStream();

    dataUrl = await new Promise<string>((resolve, reject) => {
      const video = document.createElement("video");
      video.srcObject = stream!;
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        video.play().then(() => {
          requestAnimationFrame(() => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const dpr = window.devicePixelRatio || 1;
            const canvas = document.createElement("canvas");
            canvas.width = vw * dpr;
            canvas.height = vh * dpr;
            const ctx = canvas.getContext("2d")!;
            const srcW = Math.min(video.videoWidth, vw * dpr);
            const srcH = Math.min(video.videoHeight, vh * dpr);
            ctx.drawImage(video, 0, 0, srcW, srcH, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/png"));
          });
        }).catch(reject);
      };
      video.onerror = reject;
    });
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === "NotAllowedError") throw new Error("CANCELLED");
    throw err;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    restoreElements(savedSdk);
  }

  return dataUrl;
}

// ── Screen recording ──────────────────────────────────────────────────────────

export async function startRecording(
  onDone: (dataUrl: string) => void
): Promise<{ stop: () => void }> {
  const savedSdk = hideSdkElements();

  let stream: MediaStream;
  try {
    stream = await getDisplayStream();
  } catch (err: unknown) {
    restoreElements(savedSdk);
    const name = (err as { name?: string }).name;
    if (name === "NotAllowedError") throw new Error("CANCELLED");
    throw err;
  }

  restoreElements(savedSdk);

  const chunks: Blob[] = [];
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";

  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: mimeType });
    const reader = new FileReader();
    reader.onload = () => onDone(reader.result as string);
    reader.readAsDataURL(blob);
  };

  // Also stop when user clicks the browser's native "Stop sharing" button
  stream.getVideoTracks()[0].onended = () => recorder.stop();

  recorder.start(250); // collect chunks every 250 ms

  return { stop: () => recorder.stop() };
}
