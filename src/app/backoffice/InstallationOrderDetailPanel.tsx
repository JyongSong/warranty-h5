"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export default function InstallationOrderDetailPanel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    panel?.querySelector<HTMLElement>("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      router.back();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [router]);

  return (
    <aside
      ref={panelRef}
      aria-label="설치 주문 상세"
      className="h-[calc(100dvh-3.5rem)] w-full shrink-0 overflow-y-auto border-l border-zinc-200 bg-white shadow-[-12px_0_32px_rgba(24,24,27,0.08)] md:h-screen lg:w-1/2"
    >
      {children}
    </aside>
  );
}
