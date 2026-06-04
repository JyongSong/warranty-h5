"use client";

type Props = {
  onClose: () => void;
};

export default function SnLocationModal({ onClose }: Props) {
  const imageUrl = "/reg/sn-location.png";

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>
          아카라 스마트 도어락 SN (일련번호) 위치 안내
        </div>

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="아카라 스마트 도어락 SN (일련번호) 위치"
            style={imageStyle}
          />
        ) : (
          <div style={placeholderStyle}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              아카라 스마트 도어락 SN (일련번호) 위치 이미지 준비 중
            </div>
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 6 }}>
              제품 또는 박스 라벨에 인쇄되어 있습니다.
            </div>
          </div>
        )}

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

const imageStyle: React.CSSProperties = {
  width: "100%",
  height: "auto",
  borderRadius: 10,
  display: "block",
};

const placeholderStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 200,
  borderRadius: 10,
  background: "#f4f4f5",
  border: "1px dashed #d4d4d8",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: 24,
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
