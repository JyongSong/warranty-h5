"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { normalizeAndValidateK100Sn } from "@/lib/k100Sn";

type Props = {
  title?: string;
  onClose: () => void;
  onResult: (sn: string) => void; // 识别成功回填
};

export default function OcrScanModalK100({
  title = "K100 사진 인식(OCR)",
  onClose,
  onResult,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [candidate, setCandidate] = useState<string>("");

  const canvasId = useMemo(() => `ocr-canvas-${Math.random().toString(16).slice(2)}`, []);

  useEffect(() => {
    let alive = true;

    async function openCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!alive) return;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      } catch (e: any) {
        setMsg(e?.message ?? "카메라를 열 수 없습니다.");
      }
    }

    openCamera();

    return () => {
      alive = false;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function captureAndOcr() {
    if (!videoRef.current || !canvasRef.current) return;
    setBusy(true);
    setMsg("");
    setCandidate("");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");

      // 캔버스 사이즈 = 영상 프레임
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // OCR 실행 (eng)
      const r = await Tesseract.recognize(canvas, "eng", {
        logger: () => {},
      });

      const rawText = r?.data?.text ?? "";
      const { ok, normalized, error } = normalizeAndValidateK100Sn(rawText);

      if (!ok) {
        setCandidate(normalized); // 정규화된 후보를 보여주고 수정 유도
        setMsg(error);
        return;
      }

      onResult(normalized);
    } catch (e: any) {
      setMsg(e?.message ?? "인식에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function useCandidate() {
    const { ok, normalized, error } = normalizeAndValidateK100Sn(candidate);
    if (!ok) {
      setMsg(error);
      return;
    }
    onResult(normalized);
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>

        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10, lineHeight: 1.5 }}>
          SN이 잘 보이도록 가까이 대고, 흔들림/반사를 최소화해 주세요. <br />
          K100 SN 규칙: <b>AKS</b>로 시작하는 <b>10자리</b> (영문+숫자)
        </div>

        <video
          ref={videoRef}
          playsInline
          style={{
            width: "100%",
            borderRadius: 12,
            background: "#000",
          }}
        />

        <canvas
          id={canvasId}
          ref={canvasRef}
          style={{ display: "none" }}
        />

        {msg ? (
          <div style={{ background: "#f6f7f9", padding: 10, borderRadius: 10, fontSize: 13, marginTop: 10 }}>
            {msg}
          </div>
        ) : null}

        <button
          onClick={captureAndOcr}
          disabled={busy}
          style={primaryBtnStyle(busy)}
        >
          {busy ? "인식 중..." : "촬영 후 인식"}
        </button>

        {/* 후보값이 있으면 수정/확정 */}
        {candidate ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
              인식 결과(수정 가능):
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  fontSize: 13,
                }}
              />
              <button onClick={useCandidate} style={secondaryBtnStyle}>
                사용
              </button>
            </div>
          </div>
        ) : null}

        <button onClick={onClose} style={closeBtnStyle}>
          닫기
        </button>
      </div>
    </div>
  );
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

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "none",
    background: "#111",
    color: "#fff",
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 72,
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