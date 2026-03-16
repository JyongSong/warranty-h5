import { requireAdminPage } from "@/lib/adminAuth";
import { getCafe24Status } from "@/lib/cafe24";

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return value.toISOString().replace("T", " ").slice(0, 16);
}

export default async function Cafe24Page() {
  await requireAdminPage("/cafe24");
  const status = await getCafe24Status();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#edf1f3_0%,#fbfaf7_55%,#ffffff_100%)] px-4 py-10 text-zinc-900">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-black/10 bg-white/90 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
        <div className="mb-6">
          <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Cafe24</div>
          <h1 className="mt-2 text-3xl font-semibold">Cafe24 OAuth / SMS</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            이 프로젝트가 Cafe24 OAuth 토큰과 SMS 발송을 통합 처리합니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard label="연결 상태" value={status.connected ? "연결됨" : "미연결"} />
          <InfoCard label="환경 설정" value={status.configured ? "설정됨" : "미설정"} />
          <InfoCard label="Mall ID" value={status.token?.mallId ?? process.env.CAFE24_MALL_ID ?? "-"} />
          <InfoCard label="토큰 만료" value={formatDate(status.token?.expiresAt)} />
          <InfoCard label="리프레시 만료" value={formatDate(status.token?.refreshTokenExpiresAt)} />
          <InfoCard label="Scope" value={status.token?.scope ?? "-"} />
          <InfoCard label="갱신 시각" value={formatDate(status.token?.updatedAt)} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/api/cafe24/authorize"
            className="rounded-full bg-[#173045] px-5 py-3 text-sm font-semibold text-white"
          >
            Cafe24 연결 시작
          </a>
          <a
            href="/api/cafe24/status"
            className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700"
          >
            상태 JSON 보기
          </a>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-5 py-4">
      <div className="mb-1 text-sm text-zinc-500">{label}</div>
      <div className="text-base font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
