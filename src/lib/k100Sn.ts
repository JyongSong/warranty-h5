// src/lib/k100Sn.ts
export function normalizeAndValidateK100Sn(input: string) {
  // normalize
  const normalized = (input || "")
    .toUpperCase()
    .replace(/[\s\r\n\-_:]/g, "") // 去空白/分隔符
    .replace(/[^A-Z0-9]/g, ""); // 只保留字母数字

  // 可选：修正 OCR 常见混淆（仅在前缀 AKS 正确时对后7位做）
  const prefix = normalized.slice(0, 3);
  let tail = normalized.slice(3);

  if (prefix === "AKS") {
    tail = tail
      .replace(/O/g, "0")
      .replace(/I/g, "1")
      .replace(/S/g, "5")
      .replace(/B/g, "8");
  }

  const fixed = prefix + tail;

  // validate: AKS + 7位 = 10位
  const ok = /^AKS[A-Z0-9]{7}$/.test(fixed);

  return {
    ok,
    normalized: fixed,
    error: ok ? "" : "SN 형식이 올바르지 않습니다. (AKS로 시작하는 10자리 영문+숫자)",
  };
}