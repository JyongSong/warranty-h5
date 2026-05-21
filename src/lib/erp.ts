import sql from "mssql";

const config: sql.config = {
  server: process.env.ERP_SERVER!,
  port: Number(process.env.ERP_PORT) || 2023,
  database: "NEOE",
  user: process.env.ERP_USER!,
  password: process.env.ERP_PASSWORD!,
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
  connectionTimeout: 10000,
  requestTimeout: 20000,
};

let _pool: sql.ConnectionPool | null = null;

export async function getErpPool(): Promise<sql.ConnectionPool> {
  if (_pool?.connected) return _pool;
  _pool = await new sql.ConnectionPool(config).connect();
  return _pool;
}
