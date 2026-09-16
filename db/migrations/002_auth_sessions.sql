-- OLNOO Insurance Platform — Auth sessions (MVP V1)
-- Database-backed sessions for the authentication module.
-- Applies after db/migrations/001_init_schema.sql. Does not modify it.

CREATE TABLE auth_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_sessions_account_id ON auth_sessions (account_id);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions (expires_at);
