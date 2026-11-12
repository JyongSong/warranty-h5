import { prisma } from "@/lib/prisma";

const STATUS: Record<string, { text: string; cls: string }> = {
  NOT_MEMBER: { text: "팝빌 미가입", cls: "bg-red-100 text-red-700" },
  NO_CERT: { text: "인증서 미등록", cls: "bg-amber-100 text-amber-800" },
  CERT_INVALID: { text: "인증서 확인 필요", cls: "bg-red-100 text-red-700" },
  READY: { text: "연동 완료", cls: "bg-emerald-100 text-emerald-800" },
};

const SOON_MS = 30 * 24 * 3600 * 1000;
function isExpiringSoon(d: Date | null, now: Date): boolean {
  return d !== null && d.getTime() - now.getTime() < SOON_MS;
}

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");

/** 기사 팝빌 전자세금계산서 연동 상태(앱 「연동 확인」·발행 때 기록). 연동 기록이 없으면 그리지 않는다. */
export default async function PopbillLinkPanel({ installerId }: { installerId: string }) {
  const now = new Date();
  const link = await prisma.installerPopbillLink.findUnique({ where: { installerId } }).catch(() => null);
  if (!link) return null;
  const st = STATUS[link.status] ?? { text: link.status, cls: "bg-zinc-100 text-zinc-600" };
  const expiresSoon = isExpiringSoon(link.certExpiresAt, now);
  return (
    <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-800">전자세금계산서 (팝빌)</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${st.cls}`}>{st.text}</span>
      </div>
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <span className="text-zinc-500">사업자번호</span> {link.corpNum}
        </div>
        <div>
          <span className="text-zinc-500">팝빌 ID</span> {link.userId ?? "-"}
        </div>
        <div className={expiresSoon ? "font-semibold text-red-600" : undefined}>
          <span className="text-zinc-500">인증서 만료</span> {fmt(link.certExpiresAt)}
        </div>
        <div>
          <span className="text-zinc-500">마지막 확인</span> {fmt(link.checkedAt)}
        </div>
      </div>
    </section>
  );
}
