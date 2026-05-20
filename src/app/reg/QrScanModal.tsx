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
  // zoom 상태: 사용자 +/- 버튼으로 조정 가능. 디바이스가 zoom 을 안 받으면
  // applyConstraints 가 조용히 무시되지만 UI 표시는 유지된다.
  const [zoom, setZoom] = useState<number>(3);
  const [zoomMax, setZoomMax] = useState<number>(5);

  const applyZoom = async (next: number) => {
    const clamped = Math.max(1, Math.min(zoomMax, Number(next.toFixed(1))));
    setZoom(clamped);
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped }] as unknown as MediaTrackConstraintSet[],
      });
    } catch {
      // 미지원 디바이스는 그냥 무시
    }
  };

  // 화면 탭 → single-shot focus + pointOfInterest 좌표 적용 → 800ms 후 continuous 복귀.
  // 일부 안드로이드 (특히 삼성) 에서 자동초점이 안 잡힐 때 수동 대응용.
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
      // 미지원 기기는 그냥 무시
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        // 방안 A: getUserMedia 단계에서 focusMode 를 top-level 에 포함.
        //         일부 안드로이드는 advanced 안의 focusMode 를 무시하므로 top-level 도 같이 시도.
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

        // 방안 B: capabilities 노출 여부와 무관하게 일단 apply 시도.
        //         디바이스가 받으면 적용, 안 받으면 조용히 catch.
        const track = stream.getVideoTracks()[0];
        trackRef.current = track ?? null;
        if (track) {
          const cap = (track.getCapabilities?.() ?? {}) as Record<
            string,
            unknown
          >;

          // B-1. continuous focus
          await track
            .applyConstraints({
              advanced: [
                { focusMode: "continuous" },
              ] as unknown as MediaTrackConstraintSet[],
            })
            .catch(() => {});

          // B-2. 근접 초점: 5cm 시작 hint. 일부 디바이스는 capabilities 에 노출 안 해도
          //      apply 는 받는다. 받지 않으면 조용히 무시.
          //      iOS Safari 는 둘 다 무시 → 기존 동작 유지.
          const fd = cap.focusDistance as
            | { min: number; max: number }
            | undefined;
          const nearFocus = fd
            ? Math.max(fd.min, Math.min(0.05, fd.max))
            : 0.05;
          await track
            .applyConstraints({
              advanced: [
                { focusMode: "continuous", focusDistance: nearFocus },
              ] as unknown as MediaTrackConstraintSet[],
            })
            .catch(() => {});

          // B-3. zoom 기본 3x. capabilities 의 max 가 있으면 그 안에서 클램프.
          //      max 가 없으면 그냥 3x 로 try.
          const zoomCap = cap.zoom as
            | { min: number; max: number; step?: number }
            | undefined;
          const maxZ = typeof zoomCap?.max === "number" ? zoomCap.max : 8;
          setZoomMax(maxZ);
          const initialZoom = Math.min(3, maxZ);
          setZoom(initialZoom);
          await track
            .applyConstraints({
              advanced: [
                { zoom: initialZoom },
              ] as unknown as MediaTrackConstraintSet[],
            })
            .catch(() => {});
        }

        // ZXing 디코더: QR + 주요 1D 바코드 동시 인식.
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
    // onResult 가 매 렌더 새 reference 여도 다시 카메라를 열 필요는 없음.
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
              {/* 扫描引导框 */}
              <div style={guideOverlayStyle}>
                <div style={guideBoxStyle} />
              </div>
            </div>
            {/* zoom 컨트롤: 디바이스가 zoom 을 안 받으면 누름 효과 없음 */}
            <div style={zoomControlsStyle}>
              <button
                type="button"
                onClick={() => applyZoom(zoom - 0.5)}
                disabled={zoom <= 1}
                style={zoomButtonStyle(zoom <= 1)}
                aria-label="zoom out"
              >
                −
              </button>
              <span style={zoomLabelStyle}>{zoom.toFixed(1)}x</span>
              <button
                type="button"
                onClick={() => applyZoom(zoom + 0.5)}
                disabled={zoom >= zoomMax}
                style={zoomButtonStyle(zoom >= zoomMax)}
                aria-label="zoom in"
              >
                +
              </button>
            </div>
            <p style={hintStyle}>화면을 탭하면 초점을 다시 맞출 수 있습니다.</p>
            <p style={hintSubStyle}>QR 또는 바코드를 가이드 안에 맞춰주세요.</p>
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

const zoomControlsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  marginTop: 10,
};

const zoomLabelStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#18181b",
  minWidth: 48,
  textAlign: "center",
};

function zoomButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 44,
    height: 44,
    borderRadius: 22,
    border: "1px solid #d4d4d8",
    background: disabled ? "#f4f4f5" : "#fff",
    color: disabled ? "#a1a1aa" : "#18181b",
    fontSize: 22,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    lineHeight: 1,
  };
}

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
