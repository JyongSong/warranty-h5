import Link from "next/link";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  BACKOFFICE_AUDIT_ACTION_LABEL,
  BACKOFFICE_AUDIT_ENTITY_LABEL,
  type BackofficeAuditAction,
  type BackofficeAuditEntityType,
} from "@/lib/backoffice/audit";
import {
  AUDIT_LOG_PAGE_SIZE,
  describeAuditChange,
  isBackofficeAuditEntityType,
  listBackofficeAuditLogs,
} from "@/lib/backoffice/audit-log-list";
import BackofficePageHeader from "../../BackofficePageHeader";

const AUDIT_LOG_PATH = "/backoffice/settings/audit-log";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function buildHref(type: string | undefined, page: number) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${AUDIT_LOG_PATH}?${query}` : AUDIT_LOG_PATH;
}

export default async function BackofficeAuditLogPage({ searchParams }: PageProps) {
  await requireBackofficeUserPage(AUDIT_LOG_PATH, "settings");
  const params = await searchParams;
  const rawType = single(params?.type);
  const entityType = isBackofficeAuditEntityType(rawType) ? rawType : undefined;
  const page = Math.max(1, Number.parseInt(single(params?.page) ?? "1", 10) || 1);

  const { total, rows } = await listBackofficeAuditLogs({ entityType, page });
  const lastPage = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));

  const filters: Array<{ value: string | undefined; label: string }> = [
    { value: undefined, label: "전체" },
    ...Object.entries(BACKOFFICE_AUDIT_ENTITY_LABEL).map(([value, label]) => ({ value, label })),
  ];

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="변경 이력" />
      <p className="mt-2 text-sm text-slate-500">
        기사·IoT Pass·백오피스 유저·시스템 설정·SMS 템플릿을 누가 언제 바꿨는지 보여 줍니다. 주문·A/S·정산의
        처리자는 각 상세 화면의 처리 이력에서 확인할 수 있습니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = filter.value === entityType;
          return (
            <Link
              key={filter.label}
              href={buildHref(filter.value, 1)}
              className={[
                "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold",
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>총 {total}건</span>
          {lastPage > 1 ? (
            <span className="flex items-center gap-3">
              {page > 1 ? <Link href={buildHref(entityType, page - 1)} className="font-semibold text-slate-900">이전</Link> : null}
              <span>
                {page} / {lastPage}
              </span>
              {page < lastPage ? <Link href={buildHref(entityType, page + 1)} className="font-semibold text-slate-900">다음</Link> : null}
            </span>
          ) : null}
        </div>
        <div className="overflow-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50/70 text-xs font-semibold text-slate-500">
              <tr>
                <th className="w-40 border-b border-slate-200 px-4 py-3 whitespace-nowrap">일시</th>
                <th className="w-56 border-b border-slate-200 px-4 py-3 whitespace-nowrap">처리자</th>
                <th className="w-28 border-b border-slate-200 px-4 py-3 whitespace-nowrap">대상</th>
                <th className="w-48 border-b border-slate-200 px-4 py-3 whitespace-nowrap">항목</th>
                <th className="w-28 border-b border-slate-200 px-4 py-3 whitespace-nowrap">작업</th>
                <th className="border-b border-slate-200 px-4 py-3">변경 내용</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-600">
                    기록된 변경 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const lines = describeAuditChange(row.before, row.after);
                  return (
                    <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-950">{row.actorLabel}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {BACKOFFICE_AUDIT_ENTITY_LABEL[row.entityType as BackofficeAuditEntityType] ?? row.entityType}
                      </td>
                      <td className="px-4 py-3 text-slate-950">{row.entityLabel ?? row.entityId ?? "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-950">
                        {BACKOFFICE_AUDIT_ACTION_LABEL[row.action as BackofficeAuditAction] ?? row.action}
                      </td>
                      <td className="px-4 py-3 text-xs leading-5 text-slate-600">
                        {lines.length === 0 ? "-" : lines.map((line, index) => <div key={index} className="break-all">{line}</div>)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
