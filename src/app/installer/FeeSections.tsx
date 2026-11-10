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
                {line}
                {section.subLines?.[index] ? (
                  <ul style={{ ...list, marginTop: 4 }}>
                    {section.subLines[index].map((sub) => (
                      <li key={sub} style={subItem}>
                        {sub}
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

const feeTitle: CSSProperties = { fontSize: 15, fontWeight: 800, margin: "0 0 6px" };

const list: CSSProperties = { margin: 0, paddingLeft: 18 };

const listItem: CSSProperties = { fontSize: 14, lineHeight: 1.6, color: ui.TEXT, marginBottom: 4 };

const subItem: CSSProperties = { fontSize: 13, lineHeight: 1.6, color: "#3f3f46", listStyle: "circle" };
