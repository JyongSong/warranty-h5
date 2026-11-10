import type { CSSProperties } from "react";
import { INSTALL_FEE_SECTIONS } from "@/lib/installer/notice";
import * as ui from "./ui";

// 설치비 기준 공지 본문. 공지 팝업과 자주 묻는 질문 화면이 같은 문안을 보여 준다.
export default function FeeSections() {
  return (
    <>
      {INSTALL_FEE_SECTIONS.map((section) => (
        <div key={section.title} style={{ marginTop: 16 }}>
          <h3 style={feeTitle}>{section.title}</h3>
          <ul style={list}>
            {section.lines.map((line, index) => (
              <li key={line} style={listItem}>
                <Emphasis text={line} />
                {section.subLines?.[index] ? (
                  <ul style={{ ...list, marginTop: 4 }}>
                    {section.subLines[index].map((sub) => (
                      <li key={sub} style={subItem}>
                        <Emphasis text={sub} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

// 문안의 **…** 부분을 굵게 보여 준다. 기준이 되는 말(네이버 지도 최단 거리, 현장 결제 등)을 짚는 데 쓴다.
function Emphasis({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} style={strong}>
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

const strong: CSSProperties = { fontWeight: 800, color: "#92400e" };

const feeTitle: CSSProperties = { fontSize: 15, fontWeight: 800, margin: "0 0 6px" };

const list: CSSProperties = { margin: 0, paddingLeft: 18 };

const listItem: CSSProperties = { fontSize: 14, lineHeight: 1.6, color: ui.TEXT, marginBottom: 4 };

const subItem: CSSProperties = { fontSize: 13, lineHeight: 1.6, color: "#3f3f46", listStyle: "circle" };
