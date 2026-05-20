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
    });

    // QR 是正방형, 바코드는 가로로 긴 직사각형이 더 정확하다.
    const qrbox =
      mode === "barcode"
        ? { width: 280, height: 100 }
        : { width: 240, height: 240 };

    async function start() {
      try {
        await qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox },
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
          <div id={readerId} style={{ width: "100%" }} />
        )}

        <button onClick={onClose} style={closeBtnStyle}>
          닫기
        </button>
      </div>
    </div>
  );
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
