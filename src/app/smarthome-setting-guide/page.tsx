"use client";

import React, { useState, useRef, useEffect } from "react";

// 스텝 타입 정의
interface SubStep {
  text: string;
}

interface StepData {
  title: string;
  subtitle: string;
  timeStart: number; // 초 단위
  timeEnd: number;
  timeLabel: string;
  description: string;
  subSteps: SubStep[];
  tip?: string;
  badge: string;
}

const STEPS: StepData[] = [
  {
    badge: "STEP 01",
    title: "M200 허브 등록 및 설정",
    subtitle: "전원 연결부터 앱 등록까지",
    timeStart: 0,
    timeEnd: 40,
    timeLabel: "00:00 ~ 00:40",
    description: "M200 스마트 허브를 전원에 연결하고 Aqara Home 앱에 장치를 등록합니다. 모든 스마트홈 연동의 중심이 되는 단계입니다.",
    subSteps: [
      { text: "M200 허브 뒷면에 충전기를 꽂고 전원선을 연결하세요." },
      { text: "전원이 연결되면 본체 전면의 노란색 상태 표시등이 깜빡이는지 확인합니다." },
      { text: "휴대폰의 블루투스와 Wi-Fi를 활성화한 상태로 Aqara Home 앱을 실행하세요." },
      { text: "앱 메인 화면 우측 상단의 '+' 버튼을 누르고 '장치 추가'를 선택합니다." },
      { text: "허브 뒷면의 QR 코드 중 왼쪽에 있는 'Aqara' QR 코드를 스캔하세요." },
      { text: "네트워크 연결 방법에서 'Wi-Fi 네트워크(2.4GHz)'를 선택하고 비밀번호를 입력합니다." },
      { text: "안내에 따라 허브 연결 및 추가 과정이 100% 완료될 때까지 기다린 후 '완료'를 누르세요." }
    ],
    tip: "허브는 2.4GHz Wi-Fi 대역만 지원합니다. 휴대폰이 5GHz가 아닌 2.4GHz Wi-Fi에 연결되어 있는지 사전에 꼭 확인해 주세요."
  },
  {
    badge: "STEP 02",
    title: "에어컨 IR 리모컨 연동",
    subtitle: "적외선 원격 제어 학습",
    timeStart: 41,
    timeEnd: 90, // 1분 30초
    timeLabel: "00:41 ~ 01:30",
    description: "허브의 IR(적외선) 기능을 활용해 기존 에어컨 리모컨의 신호를 학습시키고 앱으로 제어할 수 있도록 연동합니다.",
    subSteps: [
      { text: "Aqara Home 앱에서 방금 등록한 M200 허브 상세 페이지로 들어갑니다." },
      { text: "하단 리스트에서 '에어컨' 모드를 선택하고 '브랜드 선택'을 클릭하세요." },
      { text: "보유 중인 에어컨 브랜드(예: LG WHISEN 등)를 검색하여 선택합니다." },
      { text: "실제 에어컨 리모컨을 준비하고, 허브 방향을 향해 '온도 +' 버튼을 누르세요." },
      { text: "앱 화면에 표시된 온도 및 바람 세기 정보가 실제 에어컨 작동 상태와 일치하면 '다음'을 누릅니다." },
      { text: "제시되는 전원, 온도 조절 등의 제어 버튼들을 하나씩 누르며 실제 에어컨이 반응하는지 검증합니다." },
      { text: "제어 테스트가 완료되면 앱 화면에 노출할 버튼 세트를 최종 선택하고 '저장' 버튼을 누릅니다." }
    ],
    tip: "리모컨 버튼을 누를 때 허브와 리모컨이 일직선상에 가깝게 위치해야 신호가 정확히 수신 및 학습됩니다."
  },
  {
    badge: "STEP 03",
    title: "L100 도어락 허브 연동",
    subtitle: "언제 어디서나 원격 도어락 제어",
    timeStart: 193, // 3분 13초
    timeEnd: 262, // 4분 22초
    timeLabel: "03:13 ~ 04:22",
    description: "L100 스마트 도어락을 M200 허브와 연동하여 블루투스 범위를 벗어난 곳에서도 안전하게 원격으로 제어할 수 있도록 설정합니다.",
    subSteps: [
      { text: "Aqara Home 앱의 장치 목록에서 '스마트 도어락 L100'을 선택해 접속합니다." },
      { text: "휴대폰 블루투스를 통해 도어락이 자동으로 연결될 때까지 약 5초간 대기합니다." },
      { text: "도어락 메인 화면 하단에 있는 '허브에 연결' 버튼을 클릭합니다." },
      { text: "연결 가능한 기기 리스트 중 '게이트웨이 M200'을 선택하여 페어링합니다." },
      { text: "동기화가 완료되면 도어락 상세 페이지 우측 상단의 '...' 버튼을 누르고 '원격 기능'으로 진입합니다." },
      { text: "'원격 잠금 해제' 토글 스위치를 켜 활성화 상태로 전환합니다." },
      { text: "테스트를 위해 휴대폰의 블루투스를 끈 상태에서 앱의 열기 버튼을 통해 문이 열리는지 원격 제어를 작동해 봅니다." }
    ],
    tip: "안정적인 데이터 송수신을 위해 M200 허브와 L100 도어락 사이의 설치 거리는 7m 이내를 권장합니다."
  },
  {
    badge: "STEP 04",
    title: "W100 온습도 스위치 등록",
    subtitle: "스마트 제어 및 센서 등록",
    timeStart: 263, // 4분 23초
    timeEnd: 331, // 5분 31초
    timeLabel: "04:23 ~ 05:31",
    description: "W100 스마트 온습도 스위치의 후면 Matter QR 코드를 스캔하고 Zigbee 프로토콜로 허브에 바인딩합니다.",
    subSteps: [
      { text: "W100 기기 뒷면의 흰색 커버를 들어 올려 제거합니다." },
      { text: "Aqara Home 앱 메인 우측 상단의 '+' 버튼을 누르고 '장치 추가'를 선택하세요." },
      { text: "'센서' -> '온습도 센서' -> '온습도 스위치 W100 (Matter 모드 아이콘)'을 차례대로 선택합니다." },
      { text: "W100 기기 뒷면에 있는 작은 동그란 'Reset' 버튼을 5초간 길게 누릅니다." },
      { text: "기기 전면 화면이 깜빡거리며 신호 송출이 시작되는 것을 확인합니다." },
      { text: "휴대폰 카메라로 기기 후면의 'Matter QR 코드'를 선명하게 스캔하세요." },
      { text: "장치 프로토콜 선택 화면이 나오면 반드시 'Zigbee 프로토콜'을 선택하고 다음 단계로 진행합니다." },
      { text: "네트워크 및 허브 연동 진행도가 100%에 도달할 때까지 기기 근처에서 잠시 기다립니다." }
    ],
    tip: "프로토콜 전환 및 등록 과정 중에는 휴대폰과 스위치, 허브를 서로 가까이 두고 앱 화면을 끄거나 전환하지 마세요."
  },
  {
    badge: "STEP 05",
    title: "W100 스마트 자동화 설정",
    subtitle: "다이렉트 원터치 자동 제어 연동",
    timeStart: 332, // 5분 32초
    timeEnd: 528, // 8분 48초
    timeLabel: "05:32 ~ 08:48",
    description: "W100 온습도 스위치의 개별 버튼 입력(클릭, 더블클릭, 길게 누르기)에 맞춰 도어락 문 열림 및 에어컨 제어가 실행되도록 시나리오를 구성합니다.",
    subSteps: [
      { text: "Aqara Home 앱 하단 탭 메뉴 중 '자동화' -> 우측 상단 '자동실행 추가 (+)'를 터치합니다." },
      { text: "'시작 조건' 항목에서 '장치' -> '온습도 스위치 W100'을 선택합니다." },
      { text: "원하는 버튼 제어(예: '가운데 버튼을 더블클릭하세요') 동작을 조건으로 등록합니다." },
      { text: "'실행 동작' 항목에서 '장치' -> 제어할 기기(예: '스마트 도어락 L100' -> '열기')를 선택합니다." },
      { text: "우측 상단 '저장' 버튼을 누르고 보안 관련 알림 창이 나타나면 '허용/저장'을 클릭합니다." },
      { text: "이와 같은 방식으로 '가운데 길게 누르기 -> 에어컨 켜기/끄기', '위쪽 버튼 클릭 -> 에어컨 온도 +', '아래쪽 버튼 클릭 -> 에어컨 온도 -' 자동화를 각각 생성합니다." },
      { text: "등록 완료 후, 실제 W100 스위치의 각 버튼을 동작 방식대로 눌러 가며 도어락과 에어컨이 원활히 동작하는지 최종 테스트를 완료합니다." }
    ],
    tip: "자동화 등록이 완료되면 각 트리거의 명칭을 'W100 가운데 버튼 더블클릭 시 도어락 열림'과 같이 직관적으로 수정해 두면 관리가 훨씬 편리합니다."
  }
];

export default function SmarthomeSettingGuidePage() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [checkedSteps, setCheckedSteps] = useState<{ [key: string]: boolean }>({});
  const [videoPlaying, setVideoPlaying] = useState<boolean>(false);
  const [videoTime, setVideoTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // 체크박스 클릭 핸들러
  const handleCheckStep = (stepIdx: number, subStepIdx: number) => {
    const key = `${stepIdx}-${subStepIdx}`;
    setCheckedSteps(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // 특정 타임스탬프로 비디오 이동
  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().then(() => {
        setVideoPlaying(true);
      }).catch(err => console.log("Auto-play blocked or failed: ", err));
    }
  };

  // 탭 클릭 핸들러
  const handleTabChange = (index: number) => {
    setActiveTab(index);
    seekTo(STEPS[index].timeStart);
  };

  // 전체 진행도 계산
  const currentStepData = STEPS[activeTab];
  const totalSubstepsInCurrent = currentStepData.subSteps.length;
  const completedSubstepsInCurrent = currentStepData.subSteps.filter((_, idx) => 
    checkedSteps[`${activeTab}-${idx}`]
  ).length;
  const progressPercent = totalSubstepsInCurrent > 0 
    ? Math.round((completedSubstepsInCurrent / totalSubstepsInCurrent) * 100) 
    : 0;

  // 전체 가이드 진행률 계산 (전체 체크 완료율)
  const totalSubStepsCount = STEPS.reduce((acc, step) => acc + step.subSteps.length, 0);
  const totalCheckedCount = Object.values(checkedSteps).filter(Boolean).length;
  const overallProgress = totalSubStepsCount > 0 
    ? Math.round((totalCheckedCount / totalSubStepsCount) * 100) 
    : 0;

  // 비디오 시간 업데이트 감지
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setVideoTime(video.currentTime);
      
      // 현재 영상의 위치를 기반으로 활성 탭 자동 감지 연동 (사용자가 수동으로 스크롤/재생 시 반영)
      const current = video.currentTime;
      const matchedIdx = STEPS.findIndex(step => current >= step.timeStart && current <= step.timeEnd);
      if (matchedIdx !== -1 && matchedIdx !== activeTab) {
        setActiveTab(matchedIdx);
      }
    };

    const handlePlay = () => setVideoPlaying(true);
    const handlePause = () => setVideoPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [activeTab]);

  return (
    <div style={containerStyle}>
      {/* 모바일 화면 래퍼 (가로 최대 480px) */}
      <div style={phoneWrapperStyle}>
        
        {/* 헤더 */}
        <header style={headerStyle}>
          <div style={logoAreaStyle}>
            <span style={logoTextStyle}>Aqara</span>
            <span style={logoSubStyle}>스마트홈 가이드</span>
          </div>
          <div style={overallProgressWrapper}>
            <div style={overallProgressLabel}>전체 가이드 완료율</div>
            <div style={progressBarBg}>
              <div 
                style={{
                  ...progressBarFill,
                  width: `${overallProgress}%`,
                  background: "linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)"
                }} 
              />
            </div>
            <div style={overallProgressPct}>{overallProgress}% 완료</div>
          </div>
        </header>

        {/* 비디오 섹션 (상단 스티키 고정) */}
        <div style={videoSectionStyle}>
          <div style={videoWrapperStyle}>
            <video
              ref={videoRef}
              style={videoElementStyle}
              controls
              playsInline
              src="/videos/smarthome-guide.mp4"
            />
            {/* 타임스탬프 플로팅 배지 */}
            <div style={videoBadgeStyle}>
              ⏱️ {formatTime(videoTime)}
            </div>
          </div>
        </div>

        {/* 가이드 콘텐츠 바디 */}
        <div style={contentBodyStyle}>
          
          {/* 스텝 스크롤 가능한 탭 네비게이션 */}
          <div style={tabContainerStyle}>
            {STEPS.map((step, idx) => {
              const isActive = activeTab === idx;
              // 해당 단계의 서브스텝 중 완료된 개수
              const completedCount = step.subSteps.filter((_, subIdx) => 
                checkedSteps[`${idx}-${subIdx}`]
              ).length;
              const isAllDone = completedCount === step.subSteps.length;

              return (
                <button
                  key={idx}
                  onClick={() => handleTabChange(idx)}
                  style={{
                    ...tabItemStyle,
                    ...(isActive ? activeTabItemStyle : {}),
                  }}
                >
                  <span style={{
                    ...tabNumberStyle,
                    color: isActive ? "#ffffff" : "#1e3a2f",
                    backgroundColor: isActive ? "#00D2FF" : "#e8f5e9"
                  }}>
                    {isAllDone ? "✓" : idx + 1}
                  </span>
                  <span style={tabTitleStyle}>{step.title.split(" ")[0]}..</span>
                </button>
              );
            })}
          </div>

          {/* 현재 스텝 카드 */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <span style={badgeStyle}>{currentStepData.badge}</span>
                <h2 style={cardTitleStyle}>{currentStepData.title}</h2>
                <p style={cardSubtitleStyle}>{currentStepData.subtitle}</p>
              </div>
              <button 
                onClick={() => seekTo(currentStepData.timeStart)} 
                style={seekButtonStyle}
                title="이 스텝의 영상 시점으로 이동"
              >
                ▶ 영상으로 이동 ({currentStepData.timeLabel.split(" ")[0]})
              </button>
            </div>

            <p style={cardDescStyle}>{currentStepData.description}</p>

            {/* 현재 단계 진행 바 */}
            <div style={cardProgressWrapper}>
              <div style={cardProgressText}>
                <span>체크리스트 달성도</span>
                <span>{progressPercent}%</span>
              </div>
              <div style={progressBarBg}>
                <div 
                  style={{
                    ...progressBarFill,
                    width: `${progressPercent}%`,
                    backgroundColor: "#00D2FF"
                  }} 
                />
              </div>
            </div>

            {/* 체크리스트 */}
            <div style={checklistStyle}>
              {currentStepData.subSteps.map((subStep, idx) => {
                const isChecked = !!checkedSteps[`${activeTab}-${idx}`];
                return (
                  <div 
                    key={idx} 
                    onClick={() => handleCheckStep(activeTab, idx)}
                    style={{
                      ...checkItemStyle,
                      ...(isChecked ? checkItemActiveStyle : {})
                    }}
                  >
                    <div style={{
                      ...checkboxStyle,
                      ...(isChecked ? checkboxCheckedStyle : {})
                    }}>
                      {isChecked && "✓"}
                    </div>
                    <span style={{
                      ...checkTextStyle,
                      textDecoration: isChecked ? "line-through" : "none",
                      color: isChecked ? "#a1a1aa" : "#1c1917"
                    }}>
                      {subStep.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 유용한 팁 */}
            {currentStepData.tip && (
              <div style={tipBoxStyle}>
                <div style={tipHeaderStyle}>💡 TIP</div>
                <p style={tipContentStyle}>{currentStepData.tip}</p>
              </div>
            )}
          </div>

          {/* 하단 탐색 버튼 */}
          <div style={navigationButtonsStyle}>
            <button
              onClick={() => activeTab > 0 && handleTabChange(activeTab - 1)}
              disabled={activeTab === 0}
              style={{
                ...navButtonStyle,
                opacity: activeTab === 0 ? 0.4 : 1,
              }}
            >
              이전 단계
            </button>
            
            {activeTab < STEPS.length - 1 ? (
              <button
                onClick={() => handleTabChange(activeTab + 1)}
                style={{
                  ...navButtonStyle,
                  background: "linear-gradient(135deg, #1e3a2f 0%, #152920 100%)",
                  color: "#ffffff"
                }}
              >
                다음 단계
              </button>
            ) : (
              <div style={allFinishedBadgeStyle}>
                🎉 모든 가이드를 확인했습니다!
              </div>
            )}
          </div>

        </div>

        {/* 푸터 */}
        <footer style={footerStyle}>
          <p>© 2026 Aqara Smart Home Guide. All Rights Reserved.</p>
        </footer>

      </div>
    </div>
  );
}

// 시간 포맷 변환 헬퍼 함수
function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ================= CSS STYLES =================

const containerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  minHeight: "100vh",
  backgroundColor: "#12141c", // 모바일 프레임 바깥쪽 다크 배경
  fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  padding: "0",
  margin: 0,
};

const phoneWrapperStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "480px", // H5 가로 사이즈 스탠다드 제약
  backgroundColor: "#f4f6f8", // 모바일 장치 기본 라이트 그레이 배경
  minHeight: "100vh",
  boxShadow: "0 0 40px rgba(0, 0, 0, 0.4)",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  overflowX: "hidden",
};

const headerStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #12231c 0%, #1a3227 100%)",
  padding: "20px 18px",
  color: "#ffffff",
  borderBottomLeftRadius: "16px",
  borderBottomRightRadius: "16px",
};

const logoAreaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
};

const logoTextStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 900,
  letterSpacing: "-0.5px",
  color: "#00D2FF",
};

const logoSubStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  opacity: 0.8,
  backgroundColor: "rgba(255, 255, 255, 0.12)",
  padding: "2px 8px",
  borderRadius: "6px",
};

const overallProgressWrapper: React.CSSProperties = {
  marginTop: "10px",
};

const overallProgressLabel: React.CSSProperties = {
  fontSize: "11px",
  opacity: 0.7,
  marginBottom: "4px",
  fontWeight: 600,
};

const progressBarBg: React.CSSProperties = {
  width: "100%",
  height: "6px",
  backgroundColor: "rgba(255,255,255,0.15)",
  borderRadius: "999px",
  overflow: "hidden",
};

const progressBarFill: React.CSSProperties = {
  height: "100%",
  borderRadius: "999px",
  transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
};

const overallProgressPct: React.CSSProperties = {
  fontSize: "12px",
  textAlign: "right",
  marginTop: "4px",
  fontWeight: 700,
  color: "#92FE9D",
};

const videoSectionStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  backgroundColor: "#000000",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

const videoWrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  paddingTop: "56.25%", // 16:9 비율
  background: "#000",
};

const videoElementStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  border: 0,
};

const videoBadgeStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "8px",
  right: "8px",
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  backdropFilter: "blur(4px)",
  color: "#fff",
  padding: "4px 8px",
  borderRadius: "6px",
  fontSize: "11px",
  fontWeight: 600,
  pointerEvents: "none",
};

const contentBodyStyle: React.CSSProperties = {
  padding: "16px",
  flex: 1,
  display: "flex",
  flexDirection: "column",
};

const tabContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  overflowX: "auto",
  paddingBottom: "8px",
  marginBottom: "16px",
  scrollbarWidth: "none", // 파이어폭스 스크롤 숨김
};

const tabItemStyle: React.CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 12px",
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "30px",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
  color: "#64748b",
  transition: "all 0.3s ease",
  boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
};

const activeTabItemStyle: React.CSSProperties = {
  backgroundColor: "#1e3a2f",
  color: "#ffffff",
  borderColor: "#1e3a2f",
  boxShadow: "0 4px 10px rgba(30, 58, 47, 0.25)",
};

const tabNumberStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "18px",
  height: "18px",
  borderRadius: "50%",
  fontSize: "10px",
  fontWeight: 800,
};

const tabTitleStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
  marginBottom: "16px",
  border: "1px solid #edf2f7",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "12px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#e8f5e9",
  color: "#2e7d32",
  padding: "3px 8px",
  borderRadius: "4px",
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.5px",
  marginBottom: "6px",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#1c1917",
  margin: 0,
  lineHeight: 1.25,
};

const cardSubtitleStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#78716c",
  margin: "4px 0 0 0",
};

const seekButtonStyle: React.CSSProperties = {
  backgroundColor: "#00d2ff1a",
  color: "#007a99",
  border: "1px solid #00d2ff33",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "11px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.2s ease",
  whiteSpace: "nowrap",
};

const cardDescStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#57534e",
  lineHeight: 1.5,
  margin: "12px 0 16px 0",
};

const cardProgressWrapper: React.CSSProperties = {
  marginBottom: "20px",
  padding: "10px 12px",
  backgroundColor: "#f5f5f4",
  borderRadius: "8px",
};

const cardProgressText: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "11px",
  fontWeight: 700,
  color: "#78716c",
  marginBottom: "6px",
};

const checklistStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  marginBottom: "20px",
};

const checkItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  padding: "12px",
  backgroundColor: "#fafaf9",
  borderRadius: "10px",
  border: "1px solid #f5f5f4",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const checkItemActiveStyle: React.CSSProperties = {
  backgroundColor: "#f5f5f4",
  borderColor: "#e7e5e4",
};

const checkboxStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "18px",
  height: "18px",
  borderRadius: "4px",
  border: "2px solid #d6d3d1",
  backgroundColor: "#ffffff",
  fontSize: "12px",
  color: "#ffffff",
  fontWeight: "bold",
  transition: "all 0.2s ease",
  flexShrink: 0,
  marginTop: "1px",
};

const checkboxCheckedStyle: React.CSSProperties = {
  backgroundColor: "#2e7d32",
  borderColor: "#2e7d32",
};

const checkTextStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.45,
  fontWeight: 500,
};

const tipBoxStyle: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: "10px",
  padding: "12px",
};

const tipHeaderStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  color: "#b45309",
  marginBottom: "4px",
};

const tipContentStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#78350f",
  lineHeight: 1.45,
  margin: 0,
};

const navigationButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginTop: "8px",
};

const navButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.2s ease",
  textAlign: "center",
};

const allFinishedBadgeStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#e8f5e9",
  color: "#2e7d32",
  padding: "14px",
  borderRadius: "12px",
  textAlign: "center",
  fontSize: "14px",
  fontWeight: 700,
};

const footerStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "24px 16px",
  color: "#94a3b8",
  fontSize: "11px",
  backgroundColor: "#0d1b15",
  marginTop: "auto",
};
