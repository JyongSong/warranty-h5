"use client";

import { useEffect, useId, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { getErrorMessage } from "@/lib/error";

type Props = {
  title?: string;
  onClose: () => void;
  onResult: (value: string) => void; // 扫描结果回填给上层
};

export default function QrScanModal({ title = "QR 스캔", onClose, onResult }: Props) {
  const readerId = `qr-reader-${useId().replace(/:/g, "")}`;
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let active = true;
    const qr = new Html5Qrcode(readerId);

    async function start() {
      try {
        // NOTE: facingMode environment 优先后摄
        await qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            if (!active) return;
            const value = extractSnFromQr(decodedText);
            // 停止扫描再回调，避免多次触发
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
  }, [readerId, onResult]);

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
 * 允许 QR 内容是：
 * - 直接就是 SN
 * - "SN:XXXX"
 * - URL ...?sn=XXXX
 */
function extractSnFromQr(raw: string) {
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
