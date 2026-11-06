#!/usr/bin/env node
// CJ API 전용 HTTPS 프록시. 회사 고정 IP 가 있는 PC 에서 상시 실행한다.
//
// Vercel 의 CJ 동기화 cron 이 CJ_API_PROXY_URL=http://<user>:<pass>@<고정IP>:<port>
// 로 이 프록시를 거쳐 CJ 에 접속한다. CJ 쪽에서는 요청이 회사 고정 IP 에서 온
// 것으로 보인다.
//
// - CONNECT(HTTPS 터널)만 받는다. TLS 는 Vercel ↔ CJ 사이에서 끝까지 유지되어
//   이 PC 는 내용(키·주문 데이터)을 볼 수 없다.
// - 허용 목적지는 CJ API 호스트의 443 포트뿐이다(열린 프록시로 악용 방지).
// - Proxy-Authorization(Basic) 이 맞아야 한다.
//
// 실행:
//   CJ_PROXY_USER=cjsync CJ_PROXY_PASS='<긴 무작위 문자열>' CJ_PROXY_PORT=8443 \
//     node scripts/cj-api-proxy.mjs
//
// 공유기에서 외부 포트(CJ_PROXY_PORT) → 이 PC 로 포트포워딩이 필요하다.
// 의존성 없음(Node 18+).

import http from "node:http";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.CJ_PROXY_PORT || 8443);
const USER = process.env.CJ_PROXY_USER || "";
const PASS = process.env.CJ_PROXY_PASS || "";
const ALLOWED_HOSTS = new Set(
  (process.env.CJ_PROXY_ALLOWED_HOSTS || "ingress-api.cjoshopping.com,qa-ingress-api.cjoshopping.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

if (!USER || PASS.length < 16) {
  console.error("CJ_PROXY_USER 와 16자 이상의 CJ_PROXY_PASS 를 설정하세요.");
  process.exit(1);
}

const expected = Buffer.from(`Basic ${Buffer.from(`${USER}:${PASS}`).toString("base64")}`);

function authorized(header) {
  if (typeof header !== "string") return false;
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

const server = http.createServer((req, res) => {
  // 일반 HTTP 프록시 요청은 받지 않는다.
  res.writeHead(405, { "content-type": "text/plain" });
  res.end("CONNECT only\n");
});

server.on("connect", (req, clientSocket, head) => {
  const peer = clientSocket.remoteAddress;
  const [host, portText] = String(req.url || "").split(":");
  const port = Number(portText);

  if (!authorized(req.headers["proxy-authorization"])) {
    log("DENY auth", peer, req.url);
    clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="cj"\r\n\r\n');
    return;
  }
  if (!ALLOWED_HOSTS.has(host?.toLowerCase()) || port !== 443) {
    log("DENY host", peer, req.url);
    clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }

  const upstream = net.connect(port, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
    log("OK", peer, req.url);
  });

  const close = () => {
    upstream.destroy();
    clientSocket.destroy();
  };
  upstream.setTimeout(60_000, close);
  clientSocket.setTimeout(60_000, close);
  upstream.on("error", (error) => {
    log("UPSTREAM ERROR", req.url, error.message);
    if (clientSocket.writable) clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    close();
  });
  clientSocket.on("error", close);
});

server.listen(PORT, () => {
  log(`CJ API proxy listening on :${PORT}, allowed: ${[...ALLOWED_HOSTS].join(", ")}`);
});
