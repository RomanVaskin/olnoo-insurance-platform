-- OLNOO Insurance Platform — MVP V1 development seed data
-- Source of truth: docs/database/DATABASE_V1.md section 18.
-- For development only. Not for production use.
-- Run after db/migrations/001_init_schema.sql on an otherwise empty database.
-- Fixed UUIDs are used so rows are easy to reference/inspect in development.

-- Development password for all seeded accounts below: Test1234!
-- Hashes are bcrypt (cost 12) of that password, generated via src/modules/auth/password.ts.

-- 1 super admin (staff account, not tied to a Person)
INSERT INTO accounts (id, person_id, email, password_hash, role, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000101', NULL, 'admin@olnoo.dev', '$2b$12$u4efbAEGlk3S.s3jn5wi4eVLLNb42zOBZeXGgRVJ.mFL.eXp2AvY.', 'super_admin', 'active', now(), now());

-- 1 federation
INSERT INTO federations (id, name, slug, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000201', 'Федерация всестилевого каратэ России', 'vsestilevoe-karate-rf', 'active', now(), now());

-- 1 secretary (staff account, not tied to a Person)
INSERT INTO accounts (id, person_id, email, password_hash, role, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000102', NULL, 'secretary@vsestilevoe-karate.olnoo.dev', '$2b$12$KuhtNCs6uTGbFC3lr5gX8OssL6K25pNSOepTpUVpEpytkOjevT/EC', 'federation_secretary', 'active', now(), now());
INSERT INTO federation_users (id, federation_id, account_id, role, created_at) VALUES
    ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000102', 'secretary', now());

-- 1 director (staff account, not tied to a Person)
INSERT INTO accounts (id, person_id, email, password_hash, role, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000103', NULL, 'director@vsestilevoe-karate.olnoo.dev', '$2b$12$ykdEWLzcLq71WBKPSBt8Z.M6n6kryLe9MNbDIceVjDc3c7.3zj3Qe', 'federation_director', 'active', now(), now());
INSERT INTO federation_users (id, federation_id, account_id, role, created_at) VALUES
    ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000103', 'director', now());

-- 3 athletes (person + account + federation membership each)
INSERT INTO persons (id, last_name, first_name, patronymic, birthdate, gender, phone, email, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Петров', 'Пётр', 'Петрович', '2005-03-12', 'male', '+79001234501', 'petrov@example.dev', now(), now()),
    ('00000000-0000-0000-0000-000000000002', 'Сидорова', 'Анна', 'Сергеевна', '2007-07-21', 'female', '+79001234502', 'sidorova@example.dev', now(), now()),
    ('00000000-0000-0000-0000-000000000003', 'Кузнецов', 'Алексей', 'Дмитриевич', '2003-11-02', 'male', '+79001234503', 'kuznetsov@example.dev', now(), now());

-- Only the first athlete (Петров) gets a usable login password for development.
INSERT INTO accounts (id, person_id, email, password_hash, role, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'petrov@example.dev', '$2b$12$QND2syTNsj.IBhhXWPtYQObbaL.GAPAMxZRDOoedq/e6AVNljVf02', 'athlete', 'active', now(), now()),
    ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000002', 'sidorova@example.dev', NULL, 'athlete', 'active', now(), now()),
    ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000003', 'kuznetsov@example.dev', NULL, 'athlete', 'active', now(), now());

INSERT INTO federation_memberships (id, federation_id, person_id, club, coach, grade, weight, sport_name, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'СК Барс', 'Иванов И.И.', '1 разряд', 65.50, 'Каратэ', 'active', now(), now()),
    ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000002', 'СК Барс', 'Иванов И.И.', '2 разряд', 58.20, 'Каратэ', 'active', now(), now()),
    ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000003', 'СК Тигр', 'Смирнов А.А.', 'КМС', 74.00, 'Каратэ', 'active', now(), now());

-- 1 sport insurance product
INSERT INTO insurance_products (id, name, category, insurer_name, coverage_amount_kopecks, validity_days, base_price_kopecks, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000501', 'Спортивная страховка', 'sport', 'ОЛНОО Страхование', 50000000, 365, 150000, 'active', now(), now());

-- 1 federation-specific price
INSERT INTO federation_products (id, federation_id, product_id, price_kopecks, active, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000501', 150000, true, now(), now());

-- 1 unpaid application (athlete Петров)
INSERT INTO applications (id, person_id, federation_id, product_id, federation_product_id, status, amount_kopecks, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000601', 'pending_payment', 150000, now(), now());

-- 1 paid application (athlete Сидорова)
INSERT INTO applications (id, person_id, federation_id, product_id, federation_product_id, status, amount_kopecks, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000601', 'paid', 150000, now(), now());

INSERT INTO payments (id, application_id, provider, provider_payment_id, amount_kopecks, currency, status, paid_at, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000702', 'yookassa', 'dev-seed-payment-0001', 150000, 'RUB', 'paid', now(), now(), now());

-- 1 active policy (issued for the paid application)
INSERT INTO policies (id, application_id, person_id, federation_id, product_id, policy_number, status, valid_from, valid_to, policy_url, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000501', 'OLNOO-SPORT-0000001', 'active', current_date, current_date + 365, NULL, now(), now());
