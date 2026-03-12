import fs from "fs";
import { spawn } from "child_process";
import { parse } from "csv-parse/sync";

const MYSQL_CONTAINER = process.env.MYSQL_CONTAINER || "warranty_mysql";
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || "warranty";
const MYSQL_ROOT_PASSWORD = process.env.MYSQL_ROOT_PASSWORD || "root";

function sqlString(value) {
  if (value == null) return "NULL";

  const text = String(value).trim();
  if (!text) return "NULL";

  return `'${text.replace(/'/g, "''")}'`;
}

function buildSql(rows) {
  const statements = [
    "SET NAMES utf8mb4;",
    "START TRANSACTION;",
    "TRUNCATE TABLE installers;",
  ];

  for (const row of rows) {
    const name = String(row["성명"] ?? "").trim();
    const phone = String(row["전화번호"] ?? "").trim();

    if (!name || !phone) continue;

    statements.push(
      [
        "INSERT INTO installers",
        "(id, name, phone, branch, region, coverage, address, category, created_at, updated_at)",
        "VALUES",
        `(
          UUID(),
          ${sqlString(name)},
          ${sqlString(phone)},
          ${sqlString(row["지점"])},
          ${sqlString(row["광역"])},
          ${sqlString(row["지역"])},
          ${sqlString(row["주소"])},
          ${sqlString(row["분류"])},
          NOW(3),
          NOW(3)
        );`,
      ].join(" ")
    );
  }

  statements.push("COMMIT;");
  return statements.join("\n");
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

  const sql = buildSql(rows);

  await new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        MYSQL_CONTAINER,
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        `-p${MYSQL_ROOT_PASSWORD}`,
        "-D",
        MYSQL_DATABASE,
      ],
      {
        stdio: ["pipe", "inherit", "inherit"],
      }
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`mysql import failed with exit code ${code}`));
    });

    child.stdin.write(sql);
    child.stdin.end();
  });

  console.log({
    imported: rows.length,
    container: MYSQL_CONTAINER,
    database: MYSQL_DATABASE,
    charset: "utf8mb4",
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
