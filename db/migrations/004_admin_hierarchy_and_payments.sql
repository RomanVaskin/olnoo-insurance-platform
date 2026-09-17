-- OLNOO Insurance Platform — admin hierarchy, insurance-type access, payment profiles
-- Applies after 001_init_schema.sql, 002_auth_sessions.sql, 003_documents_extracted_data.sql.
-- Does not modify any of them.

-- 1. accounts.role: add 'admin' — a platform admin scoped to specific insurance types
-- (insurance_products.category values), distinct from super_admin (unrestricted) and
-- from federation_secretary/federation_director (federation-scoped, unchanged).
ALTER TABLE accounts DROP CONSTRAINT accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check
    CHECK (role IN ('super_admin', 'admin', 'federation_secretary', 'federation_director', 'athlete', 'guardian'));

-- 2. admin_insurance_access — which insurance types an 'admin' account may access, and
-- at what permission. insurance_type reuses insurance_products.category values (no
-- second parallel insurance-type model). super_admin needs no rows here; it bypasses
-- this table entirely. An 'admin' account is expected to always have >=1 row.
CREATE TABLE admin_insurance_access (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    insurance_type  TEXT NOT NULL,
    permission      TEXT NOT NULL CHECK (permission IN ('read', 'manage')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, insurance_type)
);
CREATE INDEX idx_admin_insurance_access_account_id ON admin_insurance_access (account_id);

-- 3. payment_accounts — reusable payment provider profiles (provider is 'yookassa' for
-- now). secret_key_encrypted holds an AES-256-GCM ciphertext ("v1:iv:authTag:ciphertext",
-- base64 parts), never plaintext — see src/modules/crypto/secrets.ts. NULL until a
-- secret has actually been set (a profile can exist as routing metadata before that).
CREATE TABLE payment_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider                TEXT NOT NULL CHECK (provider IN ('yookassa')),
    name                    TEXT NOT NULL,
    shop_id                 TEXT NOT NULL,
    secret_key_encrypted    TEXT NULL,
    status                  TEXT NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. payment_routing — which payment_accounts row applies to a product / federation /
-- insurance type, with deterministic precedence product > federation > insurance_type >
-- default, derived purely from which column is set (no priority column needed): exactly
-- one of product_id/federation_id/insurance_type is set, or all three are NULL for the
-- single optional default rule. The four partial unique indexes below guarantee at most
-- one rule per target, so resolution never has to guess between duplicates.
CREATE TABLE payment_routing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_account_id  UUID NOT NULL REFERENCES payment_accounts(id),
    insurance_type      TEXT NULL,
    federation_id       UUID NULL REFERENCES federations(id),
    product_id          UUID NULL REFERENCES insurance_products(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (product_id IS NOT NULL AND federation_id IS NULL AND insurance_type IS NULL) OR
        (product_id IS NULL AND federation_id IS NOT NULL AND insurance_type IS NULL) OR
        (product_id IS NULL AND federation_id IS NULL AND insurance_type IS NOT NULL) OR
        (product_id IS NULL AND federation_id IS NULL AND insurance_type IS NULL)
    )
);
CREATE UNIQUE INDEX uq_payment_routing_product ON payment_routing (product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX uq_payment_routing_federation ON payment_routing (federation_id) WHERE federation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_payment_routing_insurance_type ON payment_routing (insurance_type) WHERE insurance_type IS NOT NULL;
CREATE UNIQUE INDEX uq_payment_routing_default ON payment_routing ((true)) WHERE product_id IS NULL AND federation_id IS NULL AND insurance_type IS NULL;

-- 5. payments.payment_account_id — records which payment_accounts profile (NULL = the
-- env-based fallback) actually serviced this payment, so GET /api/payments/:id/status
-- can re-resolve the *same* shop/secret used at creation time to query YooKassa again.
-- Without this, a payment created under a non-default profile could never be looked up
-- again once routing pointed elsewhere.
ALTER TABLE payments ADD COLUMN payment_account_id UUID NULL REFERENCES payment_accounts(id);
