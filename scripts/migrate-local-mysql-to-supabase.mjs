import "dotenv/config";
import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

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

function queryMysql(sql) {
  const output = execFileSync(
    "docker",
    [
      "exec",
      "warranty_mysql",
      "mysql",
      "--default-character-set=utf8mb4",
      "-uroot",
      "-proot",
      "-Dwarranty",
      "-N",
      "-B",
      "-e",
      sql,
    ],
    { encoding: "utf8" }
  );

  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function nullable(value) {
  return value === undefined || value === null || value === "" || value === "NULL" ? null : value;
}

function nullableInt(value) {
  const text = nullable(value);
  return text === null ? null : Number.parseInt(text, 10);
}

async function main() {
  const shippedRows = queryMysql(
    "SELECT id, sn, IFNULL(model, ''), IFNULL(shipped_date, ''), IFNULL(batch_id, '') FROM shipped_devices ORDER BY sn"
  );
  const installerRows = queryMysql(
    "SELECT id, name, phone, IFNULL(branch, ''), IFNULL(region, ''), IFNULL(coverage, ''), IFNULL(address, ''), IFNULL(category, ''), IFNULL(ability, ''), IFNULL(install_count, ''), IFNULL(happy_call_lt, ''), IFNULL(defect_count, ''), IFNULL(dissatisfaction_note, ''), created_at, updated_at FROM installers ORDER BY created_at, name"
  );
  const registrationRows = queryMysql(
    "SELECT id, sn, install_type, install_date, user_phone, IFNULL(installer_phone, ''), consent_privacy, status, IFNULL(confirm_token, ''), IFNULL(confirm_token_expires_at, ''), IFNULL(free_as_end_date, ''), submitted_at, IFNULL(confirmed_at, ''), IFNULL(confirmed_by, ''), created_at, updated_at FROM warranty_registrations ORDER BY created_at"
  );

  await prisma.$transaction([
    prisma.warrantyRegistration.deleteMany(),
    prisma.installer.deleteMany(),
    prisma.shippedDevice.deleteMany(),
  ]);

  if (shippedRows.length) {
    await prisma.shippedDevice.createMany({
      data: shippedRows.map(([id, sn, model, shippedDate, batchId]) => ({
        id,
        sn,
        model: nullable(model),
        shippedDate: nullable(shippedDate),
        batchId: nullable(batchId),
      })),
    });
  }

  if (installerRows.length) {
    await prisma.installer.createMany({
      data: installerRows.map(
        ([
          id,
          name,
          phone,
          branch,
          region,
          coverage,
          address,
          category,
          ability,
          installCount,
          happyCallLt,
          defectCount,
          dissatisfactionNote,
          createdAt,
          updatedAt,
        ]) => ({
          id,
          name,
          phone,
          branch: nullable(branch),
          region: nullable(region),
          coverage: nullable(coverage),
          address: nullable(address),
          category: nullable(category),
          ability: nullable(ability),
          installCount: nullableInt(installCount),
          happyCallLt: nullableInt(happyCallLt),
          defectCount: nullableInt(defectCount),
          dissatisfactionNote: nullable(dissatisfactionNote),
          createdAt: new Date(createdAt),
          updatedAt: new Date(updatedAt),
        })
      ),
    });
  }

  if (registrationRows.length) {
    await prisma.warrantyRegistration.createMany({
      data: registrationRows.map(
        ([
          id,
          sn,
          installType,
          installDate,
          userPhone,
          installerPhone,
          consentPrivacy,
          status,
          confirmToken,
          confirmTokenExpiresAt,
          freeAsEndDate,
          submittedAt,
          confirmedAt,
          confirmedBy,
          createdAt,
          updatedAt,
        ]) => ({
          id,
          sn,
          installType,
          installDate,
          userPhone,
          installerPhone: nullable(installerPhone),
          consentPrivacy: consentPrivacy === "1",
          status,
          confirmToken: nullable(confirmToken),
          confirmTokenExpiresAt: nullable(confirmTokenExpiresAt)
            ? new Date(confirmTokenExpiresAt)
            : null,
          freeAsEndDate: nullable(freeAsEndDate),
          submittedAt: new Date(submittedAt),
          confirmedAt: nullable(confirmedAt) ? new Date(confirmedAt) : null,
          confirmedBy: nullable(confirmedBy),
          createdAt: new Date(createdAt),
          updatedAt: new Date(updatedAt),
        })
      ),
    });
  }

  console.log(
    JSON.stringify(
      {
        shippedDevices: shippedRows.length,
        installers: installerRows.length,
        registrations: registrationRows.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
