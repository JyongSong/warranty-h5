import Link from "next/link";
import type { ReactNode } from "react";

// 행 전체를 눌러 상세로 가도록 칸마다 링크를 깐다.
export default function RowCell({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <td className={["p-0 align-top", className].filter(Boolean).join(" ")}>
      <Link href={href} className="block px-4 py-3">
        {children}
      </Link>
    </td>
  );
}
