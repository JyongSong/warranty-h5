import type { PartnerNoteItem } from "@/lib/installation/partner/views";
import { formatPartnerStatus } from "@/lib/installation/partner/routing";
import { formatPartnerDateTime } from "./format";

// 협력사 화면과 본사 상세가 같이 쓰는 진행 기록.

const AUTHOR_LABELS: Record<string, string> = {
  PARTNER: "협력사",
  HQ: "본사",
  SYSTEM: "시스템",
};

const KIND_LABELS: Record<string, string> = {
  NOTE: "메모",
  STATUS: "상태 변경",
  COMPLETION: "설치 완료 등록",
  REVIEW: "본사 검수",
};

export default function PartnerNoteTimeline({ notes }: { notes: PartnerNoteItem[] }) {
  if (notes.length === 0) {
    return <p className="text-sm text-zinc-500">기록이 없습니다.</p>;
  }

  return (
    <ol className="grid gap-3">
      {notes.map((note) => (
        <li key={note.id} className="rounded-md border border-zinc-200 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <span className="font-semibold text-zinc-800">{AUTHOR_LABELS[note.authorType] ?? note.authorType}</span>
            <span>{KIND_LABELS[note.kind] ?? note.kind}</span>
            {note.partnerStatus ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-700">
                {formatPartnerStatus(note.partnerStatus)}
              </span>
            ) : null}
            <span className="ml-auto">{formatPartnerDateTime(note.createdAt)}</span>
          </div>
          {note.body ? <p className="mt-1.5 whitespace-pre-wrap break-keep text-sm text-zinc-800">{note.body}</p> : null}
          {note.photos.length > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {note.photos.map((photo, index) =>
                photo.url ? (
                  <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL 이라 next/image 최적화 대상이 아니다 */}
                    <img
                      src={photo.url}
                      alt={`완료 사진 ${index + 1}`}
                      className="aspect-square w-full rounded border border-zinc-200 object-cover"
                    />
                  </a>
                ) : (
                  <div
                    key={photo.path}
                    className="flex aspect-square items-center justify-center rounded border border-dashed border-rose-300 text-xs text-rose-600"
                  >
                    불러오기 실패
                  </div>
                ),
              )}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
