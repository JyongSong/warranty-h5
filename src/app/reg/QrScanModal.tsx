"use client";

import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import type { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  title?: string;
  onClose: () => void;
  onResult: (value: string) => void; // 扫描结果回填给上层
};

export default function QrScanModal({
  title = "스캔",
  onClose,
  onResult,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [err, setErr] = useState<string>("");
  const [capturing, setCapturing] = useState<boolean>(false);
  const [captureMsg, setCaptureMsg] = useState<string>("");

  // 화면 탭 → single-shot focus + pointOfInterest 좌표 → 800ms 후 continuous 복귀.
  // 일부 안드로이드 (특히 삼성) 자동초점 미동작 시 수동 대응.
  const handleTapFocus = async (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const track = trackRef.current;
    if (!track) return;
    const el = videoRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    let clientX: number;
    let clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0]?.clientX ?? rect.left + rect.width / 2;
      clientY = e.touches[0]?.clientY ?? rect.top + rect.height / 2;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    try {
      await track.applyConstraints({
        advanced: [
          { pointsOfInterest: [{ x, y }], focusMode: "single-shot" },
        ] as unknown as MediaTrackConstraintSet[],
      });
      setTimeout(() => {
        track
          .applyConstraints({
            advanced: [
              { focusMode: "continuous" },
            ] as unknown as MediaTrackConstraintSet[],
          })
          .catch(() => {});
      }, 800);
    } catch {
      // 미지원 디바이스 무시
    }
  };

  // 수동 캡처: 자동 스캔이 잡지 못할 때 사용자가 적절한 순간 한 프레임을
  // 정지 후 단일 이미지 디코딩. 자동초점이 부족한 안드로이드 대응.
  const handleCapture = async () => {
    const video = videoRef.current;
    const reader = readerRef.current;
    if (!video || !reader || capturing) return;

    setCapturing(true);
    setCaptureMsg("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("CANVAS_CTX_UNAVAILABLE");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // ZXing browser API: BrowserCodeReader.decodeFromCanvas (동기)
      const decodeFromCanvas = (
        reader as unknown as {
          decodeFromCanvas: (c: HTMLCanvasElement) => { getText: () => string };
        }
      ).decodeFromCanvas;
      const result = decodeFromCanvas.call(reader, canvas);
      if (result) {
        const value = extractSn(result.getText());
        cleanupRef.current?.();
        cleanupRef.current = null;
        onResult(value);
        return;
      }
      setCaptureMsg("인식 실패. 더 가까이/밝게 비춰주세요.");
    } catch {
      setCaptureMsg("인식 실패. 다시 시도해 주세요.");
    } finally {
      setCapturing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        // 방안 A: getUserMedia 단계 top-level focusMode (일부 안드로이드 advanced 무시 대응)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            ...({ focusMode: { ideal: "continuous" } } as object),
          } as MediaTrackConstraints,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // 방안 B: 시작 후 capabilities 기반 추가 조정.
        //   B-1 continuous focus
        //   B-2 근접 hint (15cm)        ← capabilities 노출 시에만
        //   B-3 적정 zoom (1.5x)        ← capabilities 노출 시에만
        // iOS Safari 는 focusDistance / zoom 노출 안 함 → 자동 skip (기존 동작 유지).
        const track = stream.getVideoTracks()[0];
        trackRef.current = track ?? null;
        if (track) {
          const cap = (track.getCapabilities?.() ?? {}) as Record<
            string,
            unknown
          >;

          const modes = cap.focusMode as string[] | undefined;
          if (modes?.includes("continuous")) {
            await track
              .applyConstraints({
                advanced: [
                  { focusMode: "continuous" },
                ] as unknown as MediaTrackConstraintSet[],
              })
              .catch(() => {});
          }

          const fd = cap.focusDistance as
            | { min: number; max: number }
            | undefined;
          if (
            fd &&
            typeof fd.min === "number" &&
            typeof fd.max === "number"
          ) {
            const nearFocus = Math.max(fd.min, Math.min(0.15, fd.max));
            await track
              .applyConstraints({
                advanced: [
                  { focusMode: "continuous", focusDistance: nearFocus },
                ] as unknown as MediaTrackConstraintSet[],
              })
              .catch(() => {});
          }

          const zoomCap = cap.zoom as
            | { min: number; max: number; step?: number }
            | undefined;
          if (zoomCap && typeof zoomCap.max === "number" && zoomCap.max >= 1.5) {
            const targetZoom = Math.min(1.5, zoomCap.max);
            await track
              .applyConstraints({
                advanced: [
                  { zoom: targetZoom },
                ] as unknown as MediaTrackConstraintSet[],
              })
              .catch(() => {});
          }
        }

        // ZXing 디코더 (QR + 1D 동시 인식)
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import(
          "@zxing/library"
        );

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODABAR,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result) => {
            if (result) {
              controls.stop();
              stream.getTracks().forEach((t) => t.stop());
              const value = extractSn(result.getText());
              onResult(value);
            }
          }
        );

        cleanupRef.current = () => {
          controls.stop();
          stream.getTracks().forEach((t) => t.stop());
          trackRef.current = null;
          readerRef.current = null;
        };

        if (cancelled) cleanupRef.current();
      } catch (error: unknown) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : String(error);
        const isPerm =
          msg.toLowerCase().includes("permission") ||
          msg.toLowerCase().includes("notallowed") ||
          msg.toLowerCase().includes("denied");
        setErr(
          isPerm
            ? "카메라 권한이 필요합니다.\n브라우저 설정에서 카메라를 허용해 주세요."
            : getErrorMessage(error, "카메라를 열 수 없습니다.")
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // onResult 가 매 렌더 새 reference 여도 카메라를 다시 열 필요 없음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>

        {err ? (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              color: "#7f1d1d",
              padding: 12,
              borderRadius: 10,
              fontSize: 13,
              whiteSpace: "pre-line",
              lineHeight: 1.5,
            }}
          >
            {err}
          </div>
        ) : (
          <>
            <div
              style={videoWrapperStyle}
              onClick={handleTapFocus}
              onTouchStart={handleTapFocus}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={videoStyle}
              />
              <div style={guideOverlayStyle}>
                <div style={guideBoxStyle} />
              </div>
            </div>

            <p style={hintStyle}>
              자동 스캔이 안 되면 화면을 탭해 초점을 맞추거나 아래 버튼으로 캡처하세요.
            </p>

            <button
              type="button"
              onClick={handleCapture}
              disabled={capturing}
              style={captureBtnStyle(capturing)}
            >
              {capturing ? "인식 중..." : "📸 캡처해서 인식"}
            </button>

            {captureMsg && (
              <p style={captureMsgStyle}>{captureMsg}</p>
            )}
          </>
        )}

        <button onClick={handleClose} style={closeBtnStyle}>
          닫기
        </button>
      </div>
    </div>
  );
}

/**
 * 扫描结果可能形式:
 * - 直接就是 SN
 * - "SN:XXXX"
 * - URL ...?sn=XXXX
 */
function extractSn(raw: string) {
  const t = (raw || "").trim();

  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      const u = new URL(t);
      const sn = u.searchParams.get("sn");
      if (sn) return sn.trim();
    }
  } catch {}

  const m = t.match(/SN\s*[:=]\s*([A-Za-z0-9\-]+)/i);
  if (m?.[1]) return m[1].trim();

  return t;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  width: "min(520px, 100%)",
  background: "#fff",
  borderRadius: 14,
  padding: 14,
};

const videoWrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 320,
  borderRadius: 12,
  overflow: "hidden",
  background: "#000",
  cursor: "pointer",
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const guideOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

const guideBoxStyle: React.CSSProperties = {
  width: "80%",
  height: 120,
  border: "2px solid #f87171",
  borderRadius: 8,
};

const hintStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: "#71717a",
  marginTop: 8,
  marginBottom: 8,
  lineHeight: 1.5,
};

function captureBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #1d3129",
    background: disabled ? "#52766a" : "#1d3129",
    color: "#fff",
    fontWeight: 800,
    fontSize: 15,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const captureMsgStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 13,
  color: "#b42318",
  marginTop: 8,
  marginBottom: 0,
};

const closeBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};
