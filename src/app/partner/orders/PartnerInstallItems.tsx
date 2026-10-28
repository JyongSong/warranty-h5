import { parsePartnerInstallItems } from "@/lib/installation/partner/routing";

// 주문 상품 메모에서 협력사가 해야 하는 설치 작업만 뽑아 "도어락 K100 설치 ×1" 처럼 보여준다.
export default function PartnerInstallItems({ memo, compact = false }: { memo: string | null; compact?: boolean }) {
  const items = parsePartnerInstallItems(memo);
  if (items.length === 0) return <span className="text-zinc-400">-</span>;

  if (compact) {
    return (
      <span className="line-clamp-2 break-keep">
        {items.map((item) => `${item.label} ×${item.quantity}`).join(", ")}
      </span>
    );
  }

  return (
    <ul className="grid gap-1">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="flex items-baseline gap-2">
          <span className="font-semibold text-zinc-950">{item.label}</span>
          <span className="text-zinc-500">×{item.quantity}</span>
        </li>
      ))}
    </ul>
  );
}
