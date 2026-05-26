// 챕터 메타데이터. page.tsx 가 import.

export type Chapter = {
  id: string;
  number: string;        // "01" / "02" / "03"
  title: string;
  slides: number[];      // PDF 슬라이드 번호 (1-39)
  stepCount?: number;    // sectionMeta 표시용 (없으면 표시 안 함)
  accent: string;        // chapter badge 색
};

export const CHAPTERS: Chapter[] = [
  {
    id: "ch1",
    number: "01",
    title: "도어락 등록",
    // 사전 준비 (1-3) + 원본 Chapter 1 (4-18) 합침
    slides: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    stepCount: 12,
    accent: "#1d3129",
  },
  {
    id: "ch2",
    number: "02",
    title: "허브 등록",
    slides: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    stepCount: 9,
    accent: "#1d3129",
  },
  {
    id: "ch3",
    number: "03",
    title: "연결",
    // 원본 Chapter 3 (30-38) + 설치 완료 (39) 합침
    slides: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
    stepCount: 8,
    accent: "#1d3129",
  },
];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
