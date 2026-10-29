import { formatKrPhone } from "@/lib/phone";
import { parseCjRegLinkToken } from "@/lib/registration/cjRegLink";
import { getKstToday, isCjRegLinkUsedUp } from "@/lib/registration/cjRegister";
import CjRegClient from "./CjRegClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function Page({ params }: PageProps) {
  const { token } = await params;
  const parsed = parseCjRegLinkToken(decodeURIComponent(token));

  if (!parsed.ok) {
    return (
      <Notice
        title={parsed.error === "LINK_EXPIRED" ? "등록 기간이 지난 링크입니다" : "올바르지 않은 링크입니다"}
        body="문자로 받으신 링크를 다시 확인해 주시거나, 고객센터(https://o8znz.channel.io)로 문의해 주세요."
      />
    );
  }

  const { link } = parsed;
  if (await isCjRegLinkUsedUp(link)) {
    return (
      <Notice
        title="이미 등록이 완료되었습니다"
        body="이 주문의 제품정보 등록은 이미 완료되었습니다. 등록 완료 문자를 확인해 주세요."
      />
    );
  }

  return (
    <CjRegClient
      token={token}
      phoneLabel={formatKrPhone(link.userPhone)}
      shipDate={link.shipDate}
      today={getKstToday()}
      expiresOn={getKstToday(new Date(link.exp * 1000))}
    />
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "#52525b" }}>{body}</p>
    </div>
  );
}
