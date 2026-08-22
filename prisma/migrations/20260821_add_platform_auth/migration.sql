-- Create enums
DO $$ BEGIN
  CREATE TYPE PlatformRole AS ENUM ('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE AccountStatus AS ENUM ('ACTIVE', 'LOCKED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create platform_users table
CREATE TABLE IF NOT EXISTS platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  supabase_id VARCHAR(255) UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role PlatformRole NOT NULL,
  status AccountStatus NOT NULL DEFAULT 'ACTIVE',
  locked_until TIMESTAMP(6),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  last_login TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique email index
CREATE UNIQUE INDEX IF NOT EXISTS platform_users_email_unique ON platform_users (LOWER(email));

-- Indexes
CREATE INDEX IF NOT EXISTS platform_users_email_idx ON platform_users (email);
CREATE INDEX IF NOT EXISTS platform_users_role_idx ON platform_users (role);
CREATE INDEX IF NOT EXISTS platform_users_status_idx ON platform_users (status);

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP(6) NOT NULL,
  used_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_platform_user_id_idx ON password_reset_tokens (platform_user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at);

-- Create platform_sessions table
CREATE TABLE IF NOT EXISTS platform_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  jti VARCHAR(36) UNIQUE NOT NULL,
  expires_at TIMESTAMP(6) NOT NULL,
  revoked_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  user_agent VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS platform_sessions_platform_user_id_idx ON platform_sessions (platform_user_id);
CREATE INDEX IF NOT EXISTS platform_sessions_jti_idx ON platform_sessions (jti);
CREATE INDEX IF NOT EXISTS platform_sessions_expires_at_idx ON platform_sessions (expires_at);
CREATE INDEX IF NOT EXISTS platform_sessions_revoked_at_idx ON platform_sessions (revoked_at);

-- Create platform_password_history table
CREATE TABLE IF NOT EXISTS platform_password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_password_history_platform_user_id_idx ON platform_password_history (platform_user_id);
