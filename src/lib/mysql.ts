import mysql from "mysql2/promise";

const globalForMysql = globalThis as typeof globalThis & {
  mysqlPool?: mysql.Pool;
};

function createPool() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL_MISSING");
  }

  return mysql.createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
  });
}

export const mysqlPool = globalForMysql.mysqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForMysql.mysqlPool = mysqlPool;
}
