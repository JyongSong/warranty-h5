import fs from "fs";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const filePath = "./data/shipped.csv"; // 你的 CSV 文件名
  const csvText = fs.readFileSync(filePath, "utf8");

  const rows = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`CSV rows: ${rows.length}`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const sn = String(row.sn ?? "").trim();
    const model = String(row.model ?? "").trim() || null;
    const shippedDate = String(row.shipped_date ?? "").trim() || null;
    const batchId = String(row.batch_id ?? "").trim() || null;

    if (!sn) {
      skipped++;
      continue;
    }

    try {
      await prisma.shippedDevice.upsert({
        where: { sn },
        update: {
          model,
          shippedDate,
          batchId,
        },
        create: {
          sn,
          model,
          shippedDate,
          batchId,
        },
      });
      success++;
    } catch (e) {
      failed++;
      console.error("Failed row:", row);
      console.error(e);
    }
  }

  console.log({
    success,
    skipped,
    failed,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
