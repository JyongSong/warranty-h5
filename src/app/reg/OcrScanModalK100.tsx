"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Tesseract, {createWorker, PSM} from "tesseract.js";
import { normalizeAndValidateK100Sn } from "@/lib/k100Sn";

type Props = {
  title?: string;
  onClose: () => void;
  onResult: (sn: string) => void; // 识别成功回填
};
function extractK100SnFromOcrText(text: string) {
  const t = (text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ""); // 只保留字母数字

  const m = t.match(/AKS[A-Z0-9]{7}/);
  return m?.[0] ?? "";
}
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

      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;

      /**
       * 1) ROI: 贴纸竖排 SN 大字通常在画面中间偏左位置
       *    这里取一个“窄而高”的区域，专门抓竖排大字
       */
      const roiW = Math.floor(vw * 0.28);  // 竖排字列宽度（可调 0.22~0.35）
      const roiH = Math.floor(vh * 0.75);  // 高度尽量覆盖整列
      const sx = Math.floor(vw * 0.34);    // x 偏移（可调）
      const sy = Math.floor(vh * 0.12);    // y 偏移（可调）

      // 2) 先把 ROI 抽出来到一个临时 canvas
      const tmp = document.createElement("canvas");
      tmp.width = roiW;
      tmp.height = roiH;
      const tctx = tmp.getContext("2d");
      if (!tctx) throw new Error("Tmp canvas not available");

      tctx.drawImage(video, sx, sy, roiW, roiH, 0, 0, roiW, roiH);

      /**
       * 3) 把竖排 ROI 旋转 90°，让它变成横排单行/少量行
       *    rotated canvas: width=roiH, height=roiW
       */
      const scale = 2; // 放大提高识别率（手机上 2x 比较平衡）
      canvas.width = roiH * scale;
      canvas.height = roiW * scale;

      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(roiH, 0);       // 平移到旋转后可见区域
      ctx.rotate(Math.PI / 2);      // 90° 顺时针
      ctx.drawImage(tmp, 0, 0);     // 画上旋转后的 ROI
      ctx.restore();

      /**
       * 4) 预处理：灰度 + 二值化（减少背景干扰）
       */
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = img.data;
      const threshold = 170; // 可调 150~190

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const v = gray > threshold ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);

      /**
       * 5) OCR：白名单 + 单行模式
       */
      const worker = await createWorker("eng", 1, {
        logger: () => { },
      });

      await worker.setParameters({
        // 注意：这里是 number，不是 string
        tessedit_pageseg_mode: PSM.SINGLE_LINE, // single text line
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      });

      const r = await worker.recognize(canvas);
      await worker.terminate();

      const rawText = r?.data?.text ?? "";

      // 6) 从 OCR 原文里提取 AKSXXXXXXXXX（10位）
      const snCandidate = extractK100SnFromOcrText(rawText);
      const { ok, normalized, error } = normalizeAndValidateK100Sn(snCandidate);

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