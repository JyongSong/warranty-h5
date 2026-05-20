"use client";

import type { ScanMode } from "./QrScanModal";

type Props = {
  title?: string;
  onSelect: (mode: ScanMode) => void;
  onClose: () => void;
};

export default function ScanModeChoiceModal({
  title = "스캔 방식 선택",
  onSelect,
  onClose,
}: Props) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14 }}>{title}</div>

        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 14, lineHeight: 1.5 }}>
          제품 라벨에 표시된 코드 종류를 선택해 주세요.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={() => onSelect("qr")}
            style={choiceButtonStyle}
          >
            📱 QR코드 스캔
          </button>
          <button
            type="button"
            onClick={() => onSelect("barcode")}
            style={choiceButtonStyle}
          >
            📊 바코드 스캔
          </button>
        </div>

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
  width: "min(420px, 100%)",
  background: "#fff",
  borderRadius: 14,
  padding: 18,
};

const choiceButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px 12px",
  borderRadius: 12,
  border: "1px solid #d4d4d8",
  background: "#fff",
  color: "#18181b",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  textAlign: "center",
};

const closeBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
