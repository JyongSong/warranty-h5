"use client";

import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/error";

interface SurveyClientProps {
  registrationId: string;
}

type QuestionValue = "예" | "아니오" | "잘 모르겠어요" | "";

export default function SurveyClient({ registrationId }: SurveyClientProps) {
  // Page states
  const [loading, setLoading] = useState(() => {
    return !!registrationId;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    return registrationId ? null : "유효하지 않은 링크입니다. 만족도 조사 ID를 확인해 주세요.";
  });
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [model, setModel] = useState("아카라 스마트 도어락");
  const [success, setSuccess] = useState(false);
  const [userPhone, setUserPhone] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [consentEvent, setConsentEvent] = useState(false);

  // Form values
  const [q1_1, setQ1_1] = useState<QuestionValue>("");
  const [q1_2, setQ1_2] = useState<QuestionValue>("");
  const [q1_3, setQ1_3] = useState<QuestionValue>("");
  const [q2_1, setQ2_1] = useState<QuestionValue>("");
  const [q2_2, setQ2_2] = useState<QuestionValue>("");
  const [q2_3, setQ2_3] = useState<QuestionValue>("");
  const [q3_1, setQ3_1] = useState<number>(0);
  const [comment, setComment] = useState("");

  const [hoveredStar, setHoveredStar] = useState<number>(0);

  useEffect(() => {
    if (!registrationId) return;

    async function fetchSurveyInfo() {
      try {
        const res = await fetch(`/api/satisfaction-survey/info?id=${encodeURIComponent(registrationId)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error ?? "설문 정보를 불러오는 데 실패했습니다.");
        }

        if (data.alreadySubmitted) {
          setAlreadySubmitted(true);
        } else {
          if (data.model) {
            setModel(`${data.model} 도어락`);
          }
          if (data.userPhone) {
            setUserPhone(data.userPhone);
          }
          if (data.installDate) {
            setInstallDate(data.installDate);
          }
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err, "설문 정보를 불러올 수 없습니다. 링크를 확인해 주세요."));
      } finally {
        setLoading(false);
      }
    }

    fetchSurveyInfo();
  }, [registrationId]);

  const canSubmit =
    q1_1 !== "" &&
    q1_2 !== "" &&
    q1_3 !== "" &&
    q2_1 !== "" &&
    q2_2 !== "" &&
    q2_3 !== "" &&
    q3_1 > 0 &&
    consentEvent &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/satisfaction-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId,
          q1_1,
          q1_2,
          q1_3,
          q2_1,
          q2_2,
          q2_3,
          q3_1,
          comment,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error ?? "설문 제출에 실패했습니다.");
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "설문 제출 중 오류가 발생했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0" }}>
          <div style={spinnerStyle}></div>
          <p style={{ marginTop: 20, fontSize: 15, color: "#52525b" }}>만족도 조사 정보를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  if (error && !success) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", padding: "40px 16px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#18181b" }}>안내</h2>
          <p style={{ fontSize: 14, color: "#71717a", lineHeight: 1.6, marginBottom: 24 }}>{error}</p>
          <a
            href="https://www.aqaralife-service.kr"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              background: "#1d3129",
              color: "#fff",
              borderRadius: 10,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            홈으로 이동
          </a>
        </div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", padding: "50px 16px" }}>
          <div style={{ fontSize: 54, color: "#1d5e1d", marginBottom: 20 }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#18181b" }}>만족도 조사 완료</h2>
          <p style={{ fontSize: 14, color: "#52525b", lineHeight: 1.6 }}>
            고객님은 이미 만족도 조사에 참여해 주셨습니다.
            <br />
            보내주신 소중한 의견은 더 나은 서비스로 보답하는 데 적극 반영하겠습니다.
            <br />
            감사합니다.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", padding: "50px 16px" }}>
          <div style={{ fontSize: 54, color: "#1d5e1d", marginBottom: 20 }}>🎉</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#18181b" }}>설문 제출 완료</h2>
          <p style={{ fontSize: 14, color: "#52525b", lineHeight: 1.6, marginBottom: 24 }}>
            만족도 조사에 참여해 주셔서 진심으로 감사드립니다.
            <br />
            고객님의 의견을 소중히 받들어 더 좋은 품질과 서비스로 발전해 나가는 아카라 라이프가 되겠습니다.
          </p>
        </div>
      </div>
    );
  }

  const radioOptions: QuestionValue[] = ["예", "아니오", "잘 모르겠어요"];

  function renderRadioQuestion(
    title: string,
    value: QuestionValue,
    setValue: (val: QuestionValue) => void
  ) {
    return (
      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        <span style={questionTitleStyle}>{title}</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {radioOptions.map((opt) => {
            const isSelected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setValue(opt)}
                style={{
                  padding: "10px 8px",
                  borderRadius: 10,
                  border: isSelected ? "2px solid #1d3129" : "1px solid #e4e4e7",
                  background: isSelected ? "#eef8ee" : "#fff",
                  color: isSelected ? "#1d3129" : "#27272a",
                  fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "center",
                  fontSize: 13,
                  transition: "all 120ms ease",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ padding: "8px 0", borderBottom: "1px solid #f4f4f5", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1d3129", textAlign: "center" }}>
          Aqara 만족도 조사
        </h1>
      </div>

      <div style={welcomeBoxStyle}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#1d3129", marginBottom: 8 }}>
          안녕하세요, 고객님.
        </p>
        <p style={{ fontSize: 13, color: "#3f3f46", lineHeight: 1.6, margin: 0 }}>
          아카라 스마트 <b>{model}</b>을 이용해 주셔서 진심으로 감사드립니다.
        </p>
        <p style={{ fontSize: 13, color: "#3f3f46", lineHeight: 1.6, marginTop: 6, marginBottom: 0 }}>
          고객님께서 사용하며 느끼신 생생한 목소리를 반영하여 더 나은 품질과 서비스로 보답하고자 간단한 설문을 진행합니다. 설문에 참여해 주신 모든 분들께 커피 쿠폰을 선물로 드릴 예정이오니 잠시만 시간 내어 참여 부탁드립니다.
        </p>
        {(userPhone || installDate) && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e4e4e7", fontSize: 12, color: "#71717a", display: "grid", gap: 3 }}>
            {userPhone && <div>• 휴대폰 번호: {userPhone}</div>}
            {installDate && <div>• 설치 일자: {installDate}</div>}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        {/* SECTION 1 */}
        <div style={sectionBoxStyle}>
          <h3 style={sectionTitleStyle}>■ 설치 / 기사 서비스 품질 만족도</h3>
          {renderRadioQuestion("1-1) 설치 기사님은 약속된 시간에 맞춰 방문해 주셨나요?", q1_1, setQ1_1)}
          {renderRadioQuestion("1-2) 도어락 설치가 꼼꼼하고 깔끔하게 완료되었다고 느끼셨나요?", q1_2, setQ1_2)}
          {renderRadioQuestion("1-3) 기사님께서 제품 사용 방법 및 안전 주의사항을 친절하게 안내해 주셨나요?", q1_3, setQ1_3)}
        </div>

        {/* SECTION 2 */}
        <div style={sectionBoxStyle}>
          <h3 style={sectionTitleStyle}>■ 앱 설치 및 연동 사용 편의성 만족도</h3>
          {renderRadioQuestion("2-1) 도어락과 앱을 설치하고 연결하는 과정은 편리하셨나요?", q2_1, setQ2_1)}
          {renderRadioQuestion("2-2) 앱 회원가입 및 기기(도어락) 등록 과정은 큰 어려움 없이 원활하게 진행되었나요?", q2_2, setQ2_2)}
          {renderRadioQuestion("2-3) 현재 앱 사용 환경 및 기능 제공은 전반적으로 만족스러우신가요?", q2_3, setQ2_3)}
        </div>

        {/* SECTION 3 */}
        <div style={sectionBoxStyle}>
          <h3 style={sectionTitleStyle}>■ 아카라 도어락 사용 만족도</h3>
          <div style={{ display: "grid", gap: 10, justifyContent: "center", textAlign: "center", padding: "10px 0" }}>
            <span style={questionTitleStyle}>
              3-1) 실제 사용해 보신 아카라 도어락의 전반적인 사용 만족도는 어떠신가요?
            </span>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", margin: "10px 0" }}>
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = hoveredStar ? star <= hoveredStar : star <= q3_1;
                return (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    onClick={() => setQ3_1(star)}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontSize: 32,
                      cursor: "pointer",
                      padding: 0,
                      outline: "none",
                      transition: "transform 100ms ease",
                      transform: hoveredStar === star ? "scale(1.15)" : "scale(1)",
                    }}
                  >
                    {filled ? "⭐" : "☆"}
                  </button>
                );
              })}
            </div>
            {q3_1 > 0 && (
              <span style={{ fontSize: 13, color: "#1d3129", fontWeight: 700 }}>
                {q3_1}점 / 5점 만점
              </span>
            )}
          </div>
        </div>

        {/* SECTION 4 */}
        <div style={sectionBoxStyle}>
          <h3 style={sectionTitleStyle}>■ 추가 의견</h3>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={questionTitleStyle}>
              추가로 남기고 싶으신 의견이나 불편 사항이 있으시다면 자유롭게 작성해 주세요. (선택)
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="여기에 소중한 의견을 작성해 주세요."
              rows={4}
              style={textareaStyle}
            />
          </div>
        </div>

        {/* Privacy Consent Checkbox */}
        <div style={{
          background: "#f8faf9",
          border: "1px solid #e1e9e5",
          borderRadius: 12,
          padding: 14,
          marginTop: 10,
          marginBottom: 10,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input
              type="checkbox"
              id="consentEvent"
              checked={consentEvent}
              onChange={(e) => setConsentEvent(e.target.checked)}
              style={{
                marginTop: 3,
                accentColor: "#1d3129",
                cursor: "pointer",
                width: 16,
                height: 16,
              }}
            />
            <label htmlFor="consentEvent" style={{ fontSize: 13, fontWeight: 700, color: "#1d3129", cursor: "pointer", userSelect: "none" }}>
              (필수) 만족도 조사 참여 및 커피 쿠폰 발송을 위한 개인정보 수집·이용 동의
            </label>
          </div>
          <div style={{
            marginTop: 10,
            padding: 10,
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            fontSize: 11,
            color: "#71717a",
            lineHeight: 1.6,
            maxHeight: 110,
            overflowY: "auto",
          }}>
            <p style={{ margin: "0 0 6px 0", fontWeight: 700, color: "#27272a" }}>[개인정보 수집 및 이용 동의]</p>
            <p style={{ margin: "0 0 4px 0" }}>아카라 라이프는 만족도 조사 참여 혜택(커피 쿠폰) 제공을 위해 아래와 같이 고객님의 개인정보를 수집 및 이용합니다.</p>
            <ul style={{ margin: 0, paddingLeft: 14 }}>
              <li><b>수집 및 이용 목적:</b> 만족도 조사 참여자 식별 및 모바일 커피 쿠폰 발송</li>
              <li><b>수집하는 개인정보 항목:</b> 휴대폰 번호</li>
              <li><b>개인정보의 보유 및 이용 기간:</b> <span style={{ color: "#1d3129", fontWeight: 700 }}>커피 쿠폰 발송 완료 후 최대 7영업일 이내 지체 없이 파기</span></li>
              <li><b>동의 거부 권리:</b> 귀하는 동의를 거부할 권리가 있으며, 거부 시에도 설문 조사는 참여할 수 있으나 커피 쿠폰 발송 대상에서 제외됩니다.</li>
            </ul>
          </div>
        </div>

        {error && (
          <div style={{ color: "crimson", fontSize: 13, textAlign: "center", marginTop: 10 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            height: 48,
            borderRadius: 12,
            border: "1px solid #1d3129",
            background: "#1d3129",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.5,
            boxShadow: canSubmit ? "0 10px 24px rgba(29,49,41,0.3)" : "none",
            transform: canSubmit ? "none" : "none",
            transition: "all 120ms ease",
            marginTop: 15,
            marginBottom: 20,
          }}
        >
          {submitting ? "제출 중..." : "설문 제출하기"}
        </button>
      </form>
    </div>
  );
}

// PREMIUM WEB CUSTOM STYLING
const containerStyle: React.CSSProperties = {
  maxWidth: 440,
  margin: "30px auto",
  padding: "20px 16px",
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 4px 20px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const welcomeBoxStyle: React.CSSProperties = {
  background: "#f4f4f5",
  borderRadius: 12,
  padding: "16px 14px",
  marginBottom: 24,
  border: "1px solid #e4e4e7",
};

const sectionBoxStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #f4f4f5",
  borderRadius: 12,
  padding: "16px 0",
  marginBottom: 10,
  borderBottom: "1px solid #e4e4e7",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#18181b",
  marginBottom: 16,
  borderLeft: "4px solid #1d3129",
  paddingLeft: 8,
};

const questionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#27272a",
  lineHeight: 1.5,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d4d4d8",
  outline: "none",
  fontSize: 13,
  fontFamily: "inherit",
  lineHeight: 1.5,
  resize: "vertical",
};

const spinnerStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  border: "4px solid #f3f3f3",
  borderTop: "4px solid #1d3129",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};
