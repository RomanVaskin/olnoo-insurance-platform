-- OLNOO Insurance Platform — MVP V1 schema
-- Source of truth: docs/database/DATABASE_V1.md
-- Applies to an empty PostgreSQL database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. persons — a real human being. May exist without an account.
CREATE TABLE persons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    last_name       TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    patronymic      TEXT NULL,
    birthdate       DATE NULL,
    gender          TEXT NULL,
    phone           TEXT NULL,
    email           TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. accounts — login access. person_id is nullable (staff accounts need not map to a Person).
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NULL REFERENCES persons(id),
    email           TEXT NULL UNIQUE,
    phone           TEXT NULL UNIQUE,
    password_hash   TEXT NULL,
    role            TEXT NOT NULL CHECK (role IN ('super_admin', 'federation_secretary', 'federation_director', 'athlete', 'guardian')),
    status          TEXT NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. federations
CREATE TABLE federations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. federation_users — links an account to a federation with a federation-level role.
CREATE TABLE federation_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id   UUID NOT NULL REFERENCES federations(id),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    role            TEXT NOT NULL CHECK (role IN ('secretary', 'director')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (federation_id, account_id)
);

-- 5. federation_memberships — links a Person to a federation (athlete membership).
CREATE TABLE federation_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id   UUID NOT NULL REFERENCES federations(id),
    person_id       UUID NOT NULL REFERENCES persons(id),
    club            TEXT NULL,
    coach           TEXT NULL,
    grade           TEXT NULL,
    weight          NUMERIC(6,2) NULL,
    sport_name      TEXT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (federation_id, person_id)
);

-- 6. insurance_products — universal product definition.
CREATE TABLE insurance_products (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        TEXT NOT NULL,
    category                    TEXT NOT NULL,
    insurer_name                TEXT NULL,
    coverage_amount_kopecks     BIGINT NULL,
    validity_days               INTEGER NOT NULL,
    base_price_kopecks          BIGINT NOT NULL,
    status                      TEXT NOT NULL DEFAULT 'active',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. federation_products — assigns a product + federation-specific price.
CREATE TABLE federation_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    federation_id   UUID NOT NULL REFERENCES federations(id),
    product_id      UUID NOT NULL REFERENCES insurance_products(id),
    price_kopecks   BIGINT NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MVP constraint: only one active product per federation (i.e. one active sport product for now).
CREATE UNIQUE INDEX uq_federation_products_one_active_per_federation
    ON federation_products (federation_id)
    WHERE active;

-- 8. applications — insurance purchase / issuance request.
CREATE TABLE applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id               UUID NOT NULL REFERENCES persons(id),
    federation_id           UUID NULL REFERENCES federations(id),
    product_id              UUID NOT NULL REFERENCES insurance_products(id),
    federation_product_id   UUID NULL REFERENCES federation_products(id),
    status                  TEXT NOT NULL CHECK (status IN ('draft', 'pending_payment', 'paid', 'policy_issued', 'cancelled')),
    amount_kopecks          BIGINT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. payments
CREATE TABLE payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id          UUID NOT NULL REFERENCES applications(id),
    provider                TEXT NOT NULL,
    provider_payment_id     TEXT NOT NULL,
    amount_kopecks          BIGINT NOT NULL,
    currency                TEXT NOT NULL DEFAULT 'RUB',
    status                  TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
    paid_at                 TIMESTAMPTZ NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_payment_id)
);

-- 10. policies
CREATE TABLE policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL UNIQUE REFERENCES applications(id),
    person_id       UUID NOT NULL REFERENCES persons(id),
    federation_id   UUID NULL REFERENCES federations(id),
    product_id      UUID NOT NULL REFERENCES insurance_products(id),
    policy_number   TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
    valid_from      DATE NOT NULL,
    valid_to        DATE NOT NULL,
    policy_url      TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. external_identities — maps an OLNOO Person to an external platform (e.g. federation athlete_id).
CREATE TABLE external_identities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NOT NULL REFERENCES persons(id),
    provider        TEXT NOT NULL,
    external_id     TEXT NOT NULL,
    metadata        JSONB NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);

-- 12. documents
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NULL REFERENCES persons(id),
    application_id  UUID NULL REFERENCES applications(id),
    type            TEXT NOT NULL,
    file_url        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. audit_logs — critical system actions.
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NULL REFERENCES accounts(id),
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       UUID NULL,
    metadata        JSONB NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Required indexes (DATABASE_V1.md section 16).
-- Note: external_identities(provider, external_id) is already indexed by its UNIQUE constraint above.
CREATE INDEX idx_persons_last_first_name ON persons (last_name, first_name);
CREATE INDEX idx_federation_memberships_federation_id ON federation_memberships (federation_id);
CREATE INDEX idx_federation_memberships_person_id ON federation_memberships (person_id);
CREATE INDEX idx_federation_products_federation_active ON federation_products (federation_id, active);
CREATE INDEX idx_applications_person_id ON applications (person_id);
CREATE INDEX idx_applications_federation_id ON applications (federation_id);
CREATE INDEX idx_applications_status ON applications (status);
CREATE INDEX idx_payments_application_id ON payments (application_id);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_policies_person_id ON policies (person_id);
CREATE INDEX idx_policies_federation_id ON policies (federation_id);
CREATE INDEX idx_policies_status ON policies (status);
