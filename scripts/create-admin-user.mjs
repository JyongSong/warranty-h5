import fs from 'fs';
import crypto from 'crypto';
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";

// Manually load env variables from .env and .env.local
function loadEnv() {
  const envFiles = ['.env', '.env.local'];
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEqual = trimmed.indexOf('=');
          if (firstEqual > 0) {
            const key = trimmed.slice(0, firstEqual).trim();
            let val = trimmed.slice(firstEqual + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  console.error("오류: .env 또는 .env.local 파일에 설정이 누락되었습니다.");
  console.error("필요한 설정: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  ),
});

// Custom Encryption Helper matches src/lib/piiCrypto.ts
function encryptPii(value) {
  const secret = process.env.PII_ENCRYPTION_KEY || "default-dev-pii-encryption-key-must-be-32-bytes!!!";
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "enc:v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

function hmacPii(value) {
  const secret = process.env.PII_HASH_KEY || process.env.PII_ENCRYPTION_KEY || "default-dev-pii-encryption-key-must-be-32-bytes!!!";
  return crypto.createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
}

async function main() {
  const email = process.argv[2] || "admin@aqara.kr";
  const password = process.argv[3] || "Admin12345!";

  console.log(`이메일: ${email} 에 대한 Supabase 관리자 계정을 생성합니다...`);
  
  // 1. Create/Sign up user in Supabase Auth via Service Role (Bypasses email confirm email send)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let userId;
  if (authError) {
    if (authError.message.includes("already exists") || authError.message.includes("conflict")) {
      console.log("이미 Supabase Auth에 동일한 이메일의 사용자가 존재합니다. 해당 사용자의 ID를 검색합니다...");
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        throw listError;
      }
      const existingUser = listData.users.find(u => u.email === email);
      if (!existingUser) {
        throw new Error("Supabase Auth에서 기존 사용자를 찾을 수 없습니다.");
      }
      userId = existingUser.id;
    } else {
      throw authError;
    }
  } else {
    userId = authData.user.id;
    console.log(`Supabase Auth 사용자 생성 완료! (ID: ${userId})`);
  }

  // 2. Insert/Update backofficeUser with Level 1
  const emailEncrypted = encryptPii(email);
  const emailHash = hmacPii(email);
  
  const user = await prisma.backofficeUser.upsert({
    where: { supabaseUserId: userId },
    update: {
      emailEncrypted,
      emailHash,
      level: 1,
    },
    create: {
      supabaseUserId: userId,
      emailEncrypted,
      emailHash,
      level: 1,
    }
  });

  console.log("\n성공적으로 생성되었습니다!");
  console.log("----------------------------------------");
  console.log(`로그인 이메일: ${email}`);
  console.log(`로그인 비밀번호: ${password}`);
  console.log(`권한 레벨 (level): ${user.level}`);
  console.log("----------------------------------------");
  console.log("위 이메일/비밀번호로 로그인 페이지에서 접속하시면 됩니다.");
}

main()
  .catch((err) => {
    console.error("사용자 생성 중 오류 발생:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
