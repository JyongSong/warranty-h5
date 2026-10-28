import type { PartnerInstallItem } from "@/lib/installation/partner/install-items";

// 설치 품목을 "K100도어락설치 ×1" 처럼 보여준다. 현장결제 품목은 따로 표시한다.
export default function PartnerInstallItems({
  items,
  compact = false,
}: {
  items: PartnerInstallItem[];
  compact?: boolean;
}) {
  if (items.length === 0) return <span className="text-zinc-400">-</span>;

  if (compact) {
    return (
      <span className="line-clamp-2 break-keep">
        {items
          .map((item) => `${item.name} ×${item.quantity}${item.onsitePayment ? " (현장결제)" : ""}`)
          .join(", ")}
      </span>
    );
  }

  return (
    <ul className="grid gap-1">
      {items.map((item, index) => (
        <li key={`${item.code ?? item.name}-${index}`} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-zinc-950">{item.name}</span>
          <span className="text-zinc-500">×{item.quantity}</span>
          {item.onsitePayment ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">현장결제</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
