
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";

type CameraState = "off" | "starting" | "on" | "error";

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export default function JarvisOrb({
  compact = false,
}: {
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({
    hands: 0,
    mode: "idle",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scene: OrbSceneApi;

    try {
      scene = createOrbScene(container);
      sceneRef.current = scene;
    } catch (err) {
      console.error("JARVIS orb initialization failed:", err);
      setError("3D ORB INITIALIZATION FAILED");
      return;
    }

    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;

    if (!video || !overlay || trackerRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("CAMERA REQUIRES HTTPS OR LOCALHOST");
      setCamera("error");
      return;
    }

    setCamera("starting");
    setError("");

    const tracker = new HandTracker(video, overlay, {
      onRotate: (deltaTheta, deltaPhi) => {
        sceneRef.current?.rotateBy(deltaTheta, deltaPhi);
      },
      onZoom: (factor) => {
        sceneRef.current?.zoomBy(factor);
      },
      onStatus: setStatus,
    });

    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      tracker.stop();

      if (trackerRef.current === tracker) {
        trackerRef.current = null;
      }

      setCamera("error");

      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED",
      );

      console.error("JARVIS hand tracking failed:", err);
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) {
      stopGestures();
    } else {
      void startGestures();
    }
  }, [startGestures, stopGestures]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        return;
      }

      switch (event.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;

        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;

        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;

        case "g":
        case "G":
          toggleGestures();
          break;
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleGestures]);

  const cameraOn = camera === "on";

  return (
    <>
      <div
        ref={containerRef}
        className={compact ? "orb-root orb-root-chat" : "orb-root"}
      />

      {!compact && (
        <>
          <div className="overlay-vignette" />
          <div className="overlay-grain" />
          <div className="overlay-scanlines" />

          <div className="hud hud-title">J.A.R.V.I.S.</div>

          <div className="hud hud-hint">
            <div>
              <span className="key">DRAG</span> spin&nbsp;&nbsp;
              <span className="key">SCROLL</span> zoom
            </div>

            {cameraOn ? (
              <div>
                <span className="key">PINCH + MOVE</span> spin&nbsp;&nbsp;
                <span className="key">TWO HANDS</span> zoom
              </div>
            ) : (
              <div>
                <span className="key">G</span> gestures&nbsp;&nbsp;
                <span className="key">R</span> reset&nbsp;&nbsp;
                <span className="key">+/−</span> zoom
              </div>
            )}
          </div>

          <div className="hud hud-title">
            <a
              href="/chat"
              className="hud-btn"
              style={{
                pointerEvents: "auto",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              CHAT + VOICE
            </a>
          </div>

          <div className="hud hud-controls">
            <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
              <video
                ref={videoRef}
                muted
                playsInline
                className="camera-video"
              />

              <canvas
                ref={overlayRef}
                width={208}
                height={156}
                className="camera-overlay"
              />

              <div className="camera-status">
                {status.hands > 0
                  ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
                  : cameraOn
                    ? "SHOW HANDS"
                    : "CAMERA OFF"}
              </div>
            </div>

            {error && <div className="hud-error">{error}</div>}

            <div className="hud-row">
              <button
                type="button"
                className="hud-btn"
                aria-pressed={cameraOn}
                onClick={toggleGestures}
                disabled={camera === "starting"}
              >
                {camera === "starting"
                  ? "INITIALIZING..."
                  : cameraOn
                    ? "GESTURES ON"
                    : "GESTURES OFF"}
              </button>
            </div>

            <div className="hud-row">
              <button
                type="button"
                className="hud-btn"
                onClick={() => sceneRef.current?.zoomIn()}
                aria-label="Zoom in"
              >
                +
              </button>

              <button
                type="button"
                className="hud-btn"
                onClick={() => sceneRef.current?.zoomOut()}
                aria-label="Zoom out"
              >
                −
              </button>

              <button
                type="button"
                className="hud-btn"
                onClick={() => sceneRef.current?.resetView()}
              >
                RESET
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
    }
