"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const NAVIGATION_TIMEOUT_MS = 20_000;

function isBackofficeNavigation(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return false;
  if (!destination.pathname.startsWith("/backoffice")) return false;

  return destination.pathname !== window.location.pathname || destination.search !== window.location.search;
}

export default function BackofficeNavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  function finishNavigation() {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setIsPending(false);
  }

  useEffect(() => {
    // Let the newly rendered route paint before removing the feedback. This
    // avoids a synchronous state update during the route-change effect.
    const finishTimeout = window.setTimeout(finishNavigation, 0);
    return () => window.clearTimeout(finishTimeout);
  }, [pathname, searchParams]);

  useEffect(() => {
    function beginNavigation() {
      setIsPending(true);
      timeoutRef.current = window.setTimeout(finishNavigation, NAVIGATION_TIMEOUT_MS);
    }

    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (isPending) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !isBackofficeNavigation(anchor)) return;
      beginNavigation();
    }

    function handleGetSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get") return;
      if (isPending) {
        event.preventDefault();
        return;
      }

      const action = new URL(form.action, window.location.href);
      if (action.origin !== window.location.origin || !action.pathname.startsWith("/backoffice")) return;
      beginNavigation();
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleGetSubmit, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleGetSubmit, true);
    };
  }, [isPending]);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  if (!isPending) return null;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-blue-100" role="status" aria-live="polite">
        <div className="h-full w-2/5 animate-pulse rounded-full bg-blue-600" />
        <span className="sr-only">화면 전환 중</span>
      </div>
    </>
  );
}
