import Link from "next/link";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { listAsOrders } from "@/lib/installation/as/service";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  WAITING_ASSIGNMENT: "배정 대기",
  WAITING_INSTALLER_RESPONSE: "기사 응답 대기",
  INSTALLER_ASSIGNED: "처리 중",
  WAITING_HQ_REVIEW: "검수 대기",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "WAITING_ASSIGNMENT", label: "배정 대기" },
  { value: "WAITING_INSTALLER_RESPONSE", label: "기사 응답 대기" },
  { value: "INSTALLER_ASSIGNED", label: "처리 중" },
  { value: "WAITING_HQ_REVIEW", label: "검수 대기" },
  { value: "COMPLETED", label: "완료" },
];

export default async function AsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireBackofficeUserPage("/backoffice/as/search", 1);
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const items = await listAsOrders(status ? { status } : undefined);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">A/S 목록</h1>
        <Link href="/backoffice/as/register" className="h-9 rounded-md bg-zinc-900 px-4 text-sm font-semibold leading-9 text-white">
          A/S 등록
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <Link
              key={f.value}
              href={f.value ? `/backoffice/as/search?status=${f.value}` : "/backoffice/as/search"}
              className={`rounded-full px-3 py-1 text-sm ${active ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="p-3">상태</th>
              <th className="p-3">증상</th>
              <th className="p-3">고객</th>
              <th className="p-3">주소</th>
              <th className="p-3">기사</th>
              <th className="p-3">등록일</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-zinc-400">
                  A/S 내역이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="border-b border-zinc-100">
                  <td className="p-3 whitespace-nowrap">{STATUS_LABEL[it.status] ?? it.status}</td>
                  <td className="p-3">
                    <span className="text-zinc-400">{it.symptomCode}</span> {it.symptomLabel}
                  </td>
                  <td className="p-3 whitespace-nowrap">{it.customerName ?? "-"}</td>
                  <td className="p-3">{it.address ?? "-"}</td>
                  <td className="p-3 whitespace-nowrap">{it.installerName ?? "-"}</td>
                  <td className="p-3 whitespace-nowrap text-zinc-500">
                    {new Date(it.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
