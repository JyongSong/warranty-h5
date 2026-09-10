// P0 就绪诊断（只读）：检查新派单系统上线前的开关 / 环境变量 / 师傅数据就绪度。
// 只做 SELECT/count，绝不写库。用法：node scripts/p0-readiness-check.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  ),
});

const YES = "✅";
const NO = "❌";
const WARN = "⚠️ ";

// —— 1. 必需环境变量（只看有没有，不打印值）——
const REQUIRED_ENV = [
  "DATABASE_URL",
  "DIRECT_URL",
  "ERP_SERVER",
  "ERP_PORT",
  "ERP_USER",
  "ERP_PASSWORD",
  "SOLAPI_API_KEY",
  "SOLAPI_API_SECRET",
  "SOLAPI_SENDER",
  "PII_ENCRYPTION_KEY",
  "PII_HASH_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_BASE_URL",
];

// —— 2. P0 关键开关（key 来自 src/lib/backoffice/system-settings.ts）——
const SWITCHES = [
  { key: "installation.syncOrders.enabled", want: "true", note: "ERP 订单同步 cron" },
  { key: "installation.dispatcher.enabled", want: "true", note: "派单 dispatcher cron" },
  { key: "installation.sms.deliveryMode", want: "test → production", note: "短信开关(先 test)" },
  { key: "installation.sms.customerInputRequestMode", want: "auto/manual", note: "客户输入请求方式" },
  { key: "installation.sms.testPhoneNumber", want: "填测试号", note: "test 模式收件号" },
  { key: "installation.sms.sendWindowStart", want: "08:00", note: "自动发短信起始(默认08:00)" },
  { key: "installation.sms.sendWindowEnd", want: "20:00", note: "自动发短信结束(默认20:00)" },
];

function checkEnv() {
  console.log("\n=== 1) 必需环境变量 ===");
  let missing = 0;
  for (const name of REQUIRED_ENV) {
    const ok = Boolean(process.env[name]?.trim());
    if (!ok) missing++;
    console.log(`  ${ok ? YES : NO} ${name}`);
  }
  console.log(missing === 0 ? `  → 全部就位` : `  → 缺 ${missing} 个`);
}

async function checkSwitches() {
  console.log("\n=== 2) 关键开关当前值（DB: backoffice_settings）===");
  const rows = await prisma.backofficeSetting.findMany({
    where: { key: { in: SWITCHES.map((s) => s.key) } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  for (const s of SWITCHES) {
    const cur = byKey.get(s.key);
    const shown = cur === undefined ? "（未设置→用代码默认）" : `"${cur}"`;
    console.log(`  • ${s.key}\n      当前=${shown}  | 期望≈${s.want}  | ${s.note}`);
  }
  console.log(
    `  ${WARN}提醒：sync-orders / dispatcher 默认 false、deliveryMode 默认 disabled；` +
      `上线要显式设 true / test。`
  );
}

async function checkInstallers() {
  console.log("\n=== 3) 师傅数据就绪度（DB: installers）===");
  const total = await prisma.installer.count();
  const active = await prisma.installer.count({ where: { active: true } });
  // 结构化字段就绪：派单匹配依赖 serviceAreas + capabilities
  const activeRows = await prisma.installer.findMany({
    where: { active: true },
    select: { serviceAreas: true, capabilities: true, aqaraAppCapability: true, phone: true },
  });
  const withServiceAreas = activeRows.filter((r) => (r.serviceAreas?.length ?? 0) > 0).length;
  const withCapabilities = activeRows.filter((r) => (r.capabilities?.length ?? 0) > 0).length;
  const withAppCap = activeRows.filter((r) => r.aqaraAppCapability && r.aqaraAppCapability.trim() !== "").length;
  const noPhone = activeRows.filter((r) => !r.phone || r.phone.trim() === "").length;

  console.log(`  总师傅数：${total}`);
  console.log(`  启用(active=true)：${active}`);
  console.log(`  其中——`);
  console.log(`    ${withServiceAreas === active ? YES : WARN}有服务区域(serviceAreas)：${withServiceAreas}/${active}`);
  console.log(`    ${withCapabilities === active ? YES : WARN}有能力标签(capabilities)：${withCapabilities}/${active}`);
  console.log(`    ${withAppCap === active ? YES : WARN}有 APP 能力(aqaraAppCapability)：${withAppCap}/${active}`);
  if (noPhone > 0) console.log(`    ${NO}电话为空：${noPhone}`);
  if (active === 0) {
    console.log(`  ${NO} 没有启用的师傅 → 派单必然走空(INSTALLER_CANDIDATE_NOT_FOUND)`);
  } else if (withServiceAreas < active || withCapabilities < active) {
    console.log(`  ${WARN}部分师傅缺服务区/能力 → 这些师傅不会被匹配到；建议用 /survey 邀请函补全`);
  } else {
    console.log(`  ${YES} 师傅数据结构化字段基本就绪`);
  }
}

async function main() {
  console.log("========================================");
  console.log(" P0 就绪诊断（只读，不改任何数据）");
  console.log("========================================");
  checkEnv();
  await checkSwitches();
  await checkInstallers();
  console.log("\n完成。以上仅为现状快照，未修改任何配置或数据。\n");
}

main()
  .catch((err) => {
    console.error("诊断失败：", err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
