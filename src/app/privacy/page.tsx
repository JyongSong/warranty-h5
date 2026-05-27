export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, lineHeight: 1.7, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>개인정보 처리방침 (요약)</h1>
      <p>아카라 도어락 프로모션 무상 A/S 등록 서비스를 이용하기 위하여 아래와 같이 개인정보를 수집 및 이용합니다.</p>
      
      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8 }}>1. 개인정보 수집 및 이용 항목</h2>
      <p>휴대폰 번호, 설치 완료일, 제품 일련번호(SN), 기사 전화번호</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8 }}>2. 개인정보 수집 및 이용 목적</h2>
      <p>도어락 설치 등록 확인 및 2년 무상 A/S 혜택 제공</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8 }}>3. 개인정보의 보유 및 이용 기간</h2>
      <p><b>도어락 무상 A/S 보증 기간 만료 시까지</b> (관계 법령의 규정에 의하여 보존할 필요가 있는 경우 해당 법령에 따라 보존)</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8 }}>4. 동의를 거부할 권리 및 불이익</h2>
      <p>귀하는 개인정보 수집 및 이용에 동의하지 않을 권리가 있습니다. 단, 필수 항목 동의 거부 시 무상 A/S 혜택 등록이 제한됩니다.</p>
    </div>
  );
}