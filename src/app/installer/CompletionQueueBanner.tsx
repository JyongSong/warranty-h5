"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { countQueuedCompletions, flushCompletionQueue } from "@/lib/installer/completionQueue";

// Shows how many completion submissions are stored offline, and auto-flushes
// them on mount + whenever connectivity returns.
export default function CompletionQueueBanner() {
  const [count, setCount] = useState(0);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const initial = await countQueuedCompletions();
        if (cancelled) return;
        setCount(initial);
        if (initial > 0 && navigator.onLine) {
          setFlushing(true);
          const { remaining } = await flushCompletionQueue();
          if (cancelled) return;
          setCount(remaining);
          setFlushing(false);
        }
      } catch {
        if (!cancelled) setFlushing(false);
      }
    }

    run();
    const onOnline = () => run();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (count === 0) return null;

  return (
    <div style={banner}>
      ⏳ 오프라인 저장 {count}건 · 연결되면 자동 전송{flushing ? " (전송 중…)" : ""}
    </div>
  );
}

const banner: CSSProperties = {
  background: "#fef9c3",
  color: "#854d0e",
  border: "1px solid #fde047",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 14,
};
