#!/usr/bin/env node
// CJ 온스타일 출고 주문번호 → 우리 서버로 밀어 넣기.
//
// CJ API 는 CJ 에 등록한 고정 IP 에서만 부를 수 있다. 그래서 회사 고정 IP 로
// 나가는 PC 에서 이 스크립트를 매시 실행한다. 바깥에서 들어오는 연결이 필요
// 없으므로 공유기 포트포워딩은 필요 없다.
//
// 하는 일
//   1) CJ getDeliveryList 를 출고일 기준 최근 N일, 출고(4)·배송완료(5),
//      배송방법(미지정 + 10 센터배송), 상품코드별로 조회
//   2) 주문번호·순번·결제일·상품코드만 골라(개인정보는 버림)
//   3) POST <pushUrl> 로 전송 → 서버가 CJ 주문번호 명단에 넣는다(중복은 건너뜀)
//
// 설정: 이 파일 옆의 config.json (또는 첫 번째 인자로 경로)
//   {
//     "vendorCode": "6자리 협력업체코드",
//     "authenticationKey": "CJ API 인증키",
//     "pushUrl": "https://<우리 도메인>/api/internal/cj/order-push",
//     "pushSecret": "Vercel 의 CJ_ORDER_PUSH_SECRET 과 같은 값",
//     "itemCodes": ["2093860797"],
//     "lookbackDays": 7
//   }
//
// 실행: node cj-order-push.mjs            (전송)
//       node cj-order-push.mjs --dry-run  (CJ 조회만, 전송 안 함)
// 의존성 없음(Node 18+).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const configPath =
  args.find((arg) => !arg.startsWith("--")) ?? join(dirname(fileURLToPath(import.meta.url)), "config.json");

const CJ_BASE_URL = "https://ingress-api.cjoshopping.com";
const DELIVERY_STATUSES = ["4", "5"]; // 출고, 배송완료
const DEFAULT_METHODS = ["", "10"]; // 미지정(10 제외 전부) + 10 센터배송

function log(...parts) {
  console.log(new Date().toISOString(), ...parts);
}

function loadConfig() {
  const raw = JSON.parse(readFileSync(configPath, "utf8").replace(/^﻿/, ""));
  const config = {
    vendorCode: String(raw.vendorCode ?? "").trim(),
    authenticationKey: String(raw.authenticationKey ?? "").trim(),
    pushUrl: String(raw.pushUrl ?? "").trim(),
    pushSecret: String(raw.pushSecret ?? "").trim(),
    itemCodes: (Array.isArray(raw.itemCodes) ? raw.itemCodes : ["2093860797"]).map(String),
    deliveryMethodCodes: Array.isArray(raw.deliveryMethodCodes) ? raw.deliveryMethodCodes.map(String) : DEFAULT_METHODS,
    lookbackDays: Math.min(Math.max(Number(raw.lookbackDays) || 7, 1), 30),
    cjBaseUrl: String(raw.cjBaseUrl ?? CJ_BASE_URL).replace(/\/+$/, ""),
  };
  if (!config.vendorCode || !config.authenticationKey) throw new Error("config.json: vendorCode / authenticationKey 없음");
  if (!dryRun && (!config.pushUrl || !config.pushSecret)) throw new Error("config.json: pushUrl / pushSecret 없음");
  return config;
}

// KST 날짜(YYYY-MM-DD)
function kstDate(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fetchCj(config, query) {
  const response = await fetch(`${config.cjBaseUrl}/delivery/getDeliveryList`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      vendorCode: config.vendorCode,
      authenticationKey: config.authenticationKey,
    },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (response.status === 403) throw new Error("CJ 403: 이 PC 의 IP 가 CJ 방화벽에 등록되지 않음");
    throw new Error(`CJ 응답이 JSON 이 아님 (HTTP ${response.status})`);
  }
  if (parsed.returnCode !== "0000" || parsed.error) {
    throw new Error(`CJ 오류 ${parsed.returnCode}: ${parsed.returnMessage}`);
  }
  return Array.isArray(parsed.data) ? parsed.data : [];
}

async function main() {
  const config = loadConfig();
  const now = new Date();
  const startDate = kstDate(new Date(now.getTime() - (config.lookbackDays - 1) * 24 * 60 * 60 * 1000));
  const endDate = kstDate(now);

  // 하나라도 실패하면 전송하지 않는다(일부만 보내고 성공처럼 보이지 않게).
  const rows = [];
  for (const itemCode of config.itemCodes) {
    for (const deliveryStatus of DELIVERY_STATUSES) {
      for (const method of config.deliveryMethodCodes) {
        const query = { dateType: "3", startDate, endDate, deliveryStatus, orderType: "2", itemInformation: "1", itemCode };
        if (method) query.deliveryMethodCode = method;

        const data = await fetchCj(config, query);
        for (const row of data) {
          rows.push({
            orderNo: row.orderNo,
            orderItemSequence: row.orderItemSequence,
            orderDetailSequence: row.orderDetailSequence,
            orderProcessingSequence: row.orderProcessingSequence,
            paymentDate: row.paymentDate,
            itemCode: row.itemCode,
          });
        }
      }
    }
  }
  log(`CJ 조회 ${startDate} ~ ${endDate}: ${rows.length}행`);

  if (dryRun) {
    const sample = [...new Set(rows.map((row) => row.orderNo))].slice(0, 5);
    log("dry-run: 전송하지 않음. 주문번호 예시:", sample.join(", ") || "(없음)");
    return;
  }

  const response = await fetch(config.pushUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.pushSecret}` },
    body: JSON.stringify({ startDate, endDate, rows }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`서버 전송 실패 HTTP ${response.status}: ${text.slice(0, 300)}`);
  log("서버 전송 완료:", text);
}

main().catch((error) => {
  log("실패:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
