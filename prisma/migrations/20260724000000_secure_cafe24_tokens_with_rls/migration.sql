-- Enable RLS on cafe24_tokens table and revoke access from anonymous and authenticated users
ALTER TABLE IF EXISTS "cafe24_tokens" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "cafe24_tokens" FROM anon, authenticated;
