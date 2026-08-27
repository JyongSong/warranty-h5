import crypto from "crypto";

// CJ 담당자 계정의 비밀번호 해시를 만든다. 이 스크립트는 DB 를 만지지 않는다 —
// 해시만 찍어 주고, INSERT 는 직접 실행한다.
//
//   node scripts/hash-partner-password.mjs '원하는비밀번호'
//
// 출력된 INSERT 문을 Supabase SQL editor 에서 실행하면 계정이 생긴다.
// 비밀번호는 CJ 담당자에게 별도 경로로 전달하고, 이 터미널 기록은 지운다.

const password = process.argv[2];

if (!password) {
  console.error("사용법: node scripts/hash-partner-password.mjs '<비밀번호>'");
  process.exit(1);
}

if (password.length < 10) {
  console.error("비밀번호는 10자 이상으로 정해 주세요.");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 32).toString("hex");
const stored = `scrypt$${salt}$${hash}`;

console.log("\npassword_hash:");
console.log(stored);
console.log("\n실행할 SQL (login_id / name 은 바꿔서 쓰세요):\n");
console.log(`INSERT INTO "partner_accounts" ("login_id", "password_hash", "name", "partner_code")`);
console.log(`VALUES ('cj-onstyle', '${stored}', 'CJ 온스타일 담당자', 'CJ');`);
console.log("");
