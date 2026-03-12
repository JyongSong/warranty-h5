import fs from "fs";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizePhone(input) {
  return String(input ?? "").replace(/[^\d]/g, "");
}

function nullable(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

async function main() {
  const filePath = "./data/installer.csv";
  const csvText = fs.readFileSync(filePath, "utf8");

  const rows = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`CSV rows: ${rows.length}`);

  await prisma.installer.deleteMany();

  let imported = 0;

  for (const row of rows) {
    const name = String(row["성명"] ?? "").trim();
    const phone = normalizePhone(String(row["전화번호"] ?? ""));

    if (!name || !phone) {
      continue;
    }

    await prisma.installer.create({
      data: {
        name,
        phone,
        branch: nullable(row["지점"]),
        region: nullable(row["광역"]),
        coverage: nullable(row["지역"]),
        address: nullable(row["주소"]),
        category: nullable(row["분류"]),
      },
    });

    imported += 1;
  }

  console.log({ imported });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
