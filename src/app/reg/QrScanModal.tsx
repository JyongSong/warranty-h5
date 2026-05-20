"use client";

import { useEffect, useId, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { getErrorMessage } from "@/lib/error";

export type ScanMode = "qr" | "barcode";

type Props = {
  title?: string;
  mode?: ScanMode; // 기본 qr
  onClose: () => void;
  onResult: (value: string) => void; // 扫描结果回填给上层
};

const QR_FORMATS = [Html5QrcodeSupportedFormats.QR_CODE];

// 韩国零售/物流常见 1D barcode 类型. 库支持的全部 1D 都开。
const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

export default function QrScanModal({
  title = "QR 스캔",
  mode = "qr",
  onClose,
  onResult,
}: Props) {
  const readerId = `qr-reader-${useId().replace(/:/g, "")}`;
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let active = true;
    const formats = mode === "barcode" ? BARCODE_FORMATS : QR_FORMATS;
    const qr = new Html5Qrcode(readerId, {
      formatsToSupport: formats,
      verbose: false,
      // 브라우저 네이티브 BarcodeDetector API 가 가능하면 사용.
      // Chrome/Edge 모바일에서 1D 바코드 인식이 훨씬 빠르고 정확하다.
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
      },
    });

    // QR 은 정사각형, 바코드는 가로로 긴 직사각형이 더 정확.
    const qrbox =
      mode === "barcode"
        ? { width: 320, height: 140 }
        : { width: 260, height: 260 };

    // 자동초점 + 후면 카메라 + 가능하면 고해상도.
    // advanced 옵션은 미지원 브라우저에서 무시될 뿐 오류는 안 난다.
    const videoConstraints: MediaTrackConstraints = {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      // focusMode 는 experimental, dom lib 타입에 없어서 unknown cast.
      advanced: [
        { focusMode: "continuous" },
        { focusMode: "auto" },
      ] as unknown as MediaTrackConstraintSet[],
    };

    async function start() {
      try {
        await qr.start(
          videoConstraints,
          {
            fps: mode === "barcode" ? 15 : 10,
            qrbox,
            aspectRatio: window.innerWidth > window.innerHeight ? 16 / 9 : 9 / 16,
          },
          async (decodedText) => {
            if (!active) return;
            const value = extractSn(decodedText);
            try {
              await qr.stop();
              await qr.clear();
            } catch {}
            onResult(value);
          },
          () => {
            // ignore scan failure per frame
          }
        );

        // 카메라 시작 후 추가 자동초점 트리거 (iOS Safari 등에서 advanced 무시되는 케이스 대응)
        applyAutofocus(readerId);
      } catch (error: unknown) {
        setErr(getErrorMessage(error, "카메라를 열 수 없습니다."));
      }
    }

    start();

    return () => {
      active = false;
      (async () => {
        try {
          await qr.stop();
        } catch {}
        try {
          await qr.clear();
        } catch {}
      })();
    };
  }, [readerId, mode, onResult]);

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>

        {err ? (
          <div style={{ background: "#f6f7f9", padding: 10, borderRadius: 10, fontSize: 13 }}>
            {err}
          </div>
        ) : (
          <>
            <div
              id={readerId}
              style={{ width: "100%", cursor: "pointer" }}
              onClick={() => applyAutofocus(readerId)}
            />
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6, textAlign: "center" }}>
              {mode === "barcode"
                ? "바코드를 가로 프레임 안에 맞춰주세요. 흐릿하면 화면을 탭하세요."
                : "QR 을 프레임 안에 맞춰주세요. 흐릿하면 화면을 탭하세요."}
            </div>
          </>
        )}

        <button onClick={onClose} style={closeBtnStyle}>
          닫기
        </button>
      </div>
    </div>
  );
}

// 화면 탭으로 다시 초점을 잡도록 트리거.
// `applyConstraints` 로 focusMode 를 다시 한 번 적용해 강제 리포커스.
function applyAutofocus(containerId: string) {
  const container = document.getElementById(containerId);
  const video = container?.querySelector("video") as HTMLVideoElement | null;
  if (!video || !video.srcObject) return;
  const stream = video.srcObject as MediaStream;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    // 일단 single-shot
    track
      .applyConstraints({
        advanced: [{ focusMode: "single-shot" }] as unknown as MediaTrackConstraintSet[],
      })
      .catch(() => {});
    // 그 다음 continuous 로 복귀
    setTimeout(() => {
      track
        .applyConstraints({
          advanced: [{ focusMode: "continuous" }] as unknown as MediaTrackConstraintSet[],
        })
        .catch(() => {});
    }, 300);
  } catch {
    // 미지원 브라우저는 그냥 무시
  }
}

/**
 * 允许扫描内容是:
 * - 直接就是 SN
 * - "SN:XXXX"
 * - URL ...?sn=XXXX
 */
function extractSn(raw: string) {
  const t = (raw || "").trim();

  // URL case
  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      const u = new URL(t);
      const sn = u.searchParams.get("sn");
      if (sn) return sn.trim();
    }
  } catch {}

  // "SN:XXXX"
  const m = t.match(/SN\s*[:=]\s*([A-Za-z0-9\-]+)/i);
  if (m?.[1]) return m[1].trim();

  // default
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
