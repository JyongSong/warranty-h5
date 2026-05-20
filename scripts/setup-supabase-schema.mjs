import "dotenv/config";
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DIRECT_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS shipped_devices (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sn text NOT NULL UNIQUE,
  model text,
  shipped_date text,
  batch_id text
);

CREATE TABLE IF NOT EXISTS installers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  branch text,
  region text,
  coverage text,
  address text,
  category text,
  ability text,
  install_count integer,
  happy_call_lt integer,
  defect_count integer,
  dissatisfaction_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS installers_branch_idx ON installers(branch);
CREATE INDEX IF NOT EXISTS installers_region_idx ON installers(region);

CREATE TABLE IF NOT EXISTS admins (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  login_code text NOT NULL UNIQUE,
  name text NOT NULL,
  level integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admins_level_idx ON admins(level);

CREATE TABLE IF NOT EXISTS warranty_registrations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sn text NOT NULL UNIQUE,
  install_type text NOT NULL DEFAULT 'installer',
  install_date text NOT NULL,
  user_phone text NOT NULL,
  installer_phone text,
  consent_privacy boolean NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  confirm_token text UNIQUE,
  confirm_token_expires_at timestamptz,
  free_as_end_date text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warranty_registrations_status_idx ON warranty_registrations(status);
`;

async function main() {
  await client.connect();
  await client.query(sql);
  console.log("Supabase schema ready");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
