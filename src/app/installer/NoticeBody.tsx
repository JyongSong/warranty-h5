import type { CSSProperties, ReactNode } from "react";

/** 공지 본문: 줄바꿈을 살리고 http(s) 주소는 눌러서 열 수 있게 한다. */
export default function NoticeBody({ text, style }: { text: string; style?: CSSProperties }) {
  const parts: ReactNode[] = [];
  const re = /(https?:\/\/[^\s]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={i++} href={m[1]} style={link}>
        {m[1]}
      </a>,
    );
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <div style={{ ...body, ...style }}>{parts}</div>;
}

const body: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: "#27272a",
  whiteSpace: "pre-wrap",
  wordBreak: "keep-all",
  overflowWrap: "anywhere",
};
const link: CSSProperties = { color: "#1d4ed8", textDecoration: "underline" };
