"use client";

import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/error";

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
  const cleanupRef = useRef<(() => void) | null>(null);
  const [err, setErr] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [currentActiveId, setCurrentActiveId] = useState<string | null>(null);

  const handleSwitchCamera = () => {
    if (devices.length <= 1) return;
    const currentId = currentActiveId || activeDeviceId || devices[0].deviceId;
    const currentIndex = devices.findIndex((d) => d.deviceId === currentId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    setActiveDeviceId(nextDevice.deviceId);
    setCurrentActiveId(nextDevice.deviceId);
  };

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

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const videoConstraints: MediaTrackConstraints = activeDeviceId
          ? { deviceId: { exact: activeDeviceId } }
          : { facingMode: { ideal: "environment" } };

        videoConstraints.width = { ideal: 1920 };
        videoConstraints.height = { ideal: 1080 };
        (videoConstraints as Record<string, unknown>).focusMode = { ideal: "continuous" };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const track = stream.getVideoTracks()[0];
        trackRef.current = track ?? null;
        if (track) {
          const settings = track.getSettings?.() || {};
          if (settings.deviceId) {
            setCurrentActiveId(settings.deviceId);
          }
        }

        // Fetch and filter camera devices to prioritize rear cameras
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
          const rearDevices = videoDevices.filter((d) => {
            const label = d.label.toLowerCase();
            return (
              !label.includes("front") &&
              !label.includes("앞") &&
              !label.includes("selfie")
            );
          });
          const finalDevices = rearDevices.length > 0 ? rearDevices : videoDevices;
          setDevices(finalDevices);
        } catch (e) {
          console.error("Failed to enumerate devices", e);
        }

        // Apply advanced camera configurations with a delay of 600ms.
        // This is crucial for Android Chrome/Samsung devices to properly apply constraints.
        const constraintTimeout = setTimeout(async () => {
          if (cancelled || !track) return;
          try {
            const cap = (track.getCapabilities?.() ?? {}) as Record<
              string,
              unknown
            >;
            interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
              focusMode?: string;
              focusDistance?: number;
              zoom?: number;
            }
            const advancedConstraints: ExtendedMediaTrackConstraintSet = {};
            let hasAdvanced = false;

            const modes = cap.focusMode as string[] | undefined;
            if (modes?.includes("continuous")) {
              advancedConstraints.focusMode = "continuous";
              hasAdvanced = true;
            }

            const fd = cap.focusDistance as
              | { min: number; max: number }
              | undefined;
            if (
              fd &&
              typeof fd.min === "number" &&
              typeof fd.max === "number"
            ) {
              advancedConstraints.focusDistance = Math.max(fd.min, Math.min(0.15, fd.max));
              hasAdvanced = true;
            }

            const zoomCap = cap.zoom as
              | { min: number; max: number; step?: number }
              | undefined;
            if (zoomCap && typeof zoomCap.max === "number") {
              if (zoomCap.max >= 1.8) {
                advancedConstraints.zoom = 1.8;
                hasAdvanced = true;
              } else if (zoomCap.max >= 1.5) {
                advancedConstraints.zoom = zoomCap.max;
                hasAdvanced = true;
              }
            }

            if (hasAdvanced) {
              await track.applyConstraints({
                advanced: [advancedConstraints] as unknown as MediaTrackConstraintSet[],
              });
            }
          } catch (err) {
            console.warn("Failed to apply delayed constraints", err);
          }
        }, 600);

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

        if (cancelled || !videoRef.current) {
          clearTimeout(constraintTimeout);
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
          clearTimeout(constraintTimeout);
          controls.stop();
          stream.getTracks().forEach((t) => t.stop());
          trackRef.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeviceId]);

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
            <p style={hintStyle}>화면을 탭하면 초점을 다시 맞출 수 있습니다.</p>
            <p style={hintSubStyle}>QR 또는 바코드를 가이드 안에 맞춰주세요.</p>
          </>
        )}

        {devices.length > 1 && (
          <button onClick={handleSwitchCamera} style={switchBtnStyle}>
            🔄 카메라 전환 ({Math.max(0, devices.findIndex((d) => d.deviceId === currentActiveId)) + 1} / {devices.length})
          </button>
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
  marginBottom: 2,
};

const hintSubStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: "#a1a1aa",
  marginTop: 0,
};

const switchBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#f3f4f6",
  color: "#1f2937",
  fontWeight: 800,
  cursor: "pointer",
};

const closeBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
