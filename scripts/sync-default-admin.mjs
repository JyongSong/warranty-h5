import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const loginCode = process.env.MANAGEMENT_ACCESS_CODE?.trim();
const name = process.env.MANAGEMENT_ADMIN_NAME?.trim() || "관리자";
const level = Number.parseInt(process.env.MANAGEMENT_ADMIN_LEVEL?.trim() || "1", 10);

if (!loginCode) {
  console.error("MANAGEMENT_ACCESS_CODE_MISSING");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  ),
});

async function main() {
  const admin = await prisma.admin.upsert({
    where: { loginCode },
    update: {
      name,
      level,
    },
    create: {
      loginCode,
      name,
      level,
    },
  });

  console.log(
    JSON.stringify(
      {
        id: admin.id,
        loginCode: admin.loginCode,
        name: admin.name,
        level: admin.level,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
