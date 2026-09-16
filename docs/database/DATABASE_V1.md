# OLNOO Insurance Platform — Database V1

Version: 1.0  
Date: 2026-09-16

Database: PostgreSQL

## 1. General rules

- Use UUID primary keys for OLNOO entities.
- External athlete IDs are stored in `external_identities`.
- Do not use an external `athlete_id` as a primary key.
- Use `created_at` and `updated_at` where applicable.
- Prefer soft status fields over deleting business records.
- Money must use integer minor units (`amount_kopecks`) to avoid floating-point errors.
- All foreign keys must be explicit.

## 2. `persons`

Represents a real human being.

Fields:

- `id uuid primary key`
- `last_name text not null`
- `first_name text not null`
- `patronymic text null`
- `birthdate date null`
- `gender text null`
- `phone text null`
- `email text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Important:
A Person may exist without an Account.

## 3. `accounts`

Represents login access.

Fields:

- `id uuid primary key`
- `person_id uuid null references persons(id)`
- `email text null unique`
- `phone text null unique`
- `password_hash text null`
- `role text not null`
- `status text not null default 'active'`
- `last_login_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Allowed MVP roles:
- `super_admin`
- `federation_secretary`
- `federation_director`
- `athlete`
- `guardian`

## 4. `federations`

Fields:

- `id uuid primary key`
- `name text not null`
- `slug text not null unique`
- `status text not null default 'active'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

## 5. `federation_users`

Links accounts to a federation and defines federation-level role.

Fields:

- `id uuid primary key`
- `federation_id uuid not null references federations(id)`
- `account_id uuid not null references accounts(id)`
- `role text not null`
- `created_at timestamptz not null`

Allowed roles:
- `secretary`
- `director`

Constraint:
- unique (`federation_id`, `account_id`)

## 6. `federation_memberships`

Links a Person to a federation.

Fields:

- `id uuid primary key`
- `federation_id uuid not null references federations(id)`
- `person_id uuid not null references persons(id)`
- `club text null`
- `coach text null`
- `grade text null`
- `weight numeric(6,2) null`
- `sport_name text null`
- `status text not null default 'active'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint:
- unique (`federation_id`, `person_id`)

Do not duplicate external athlete ID here. Store it in `external_identities`.

## 7. `insurance_products`

Universal insurance product definition.

Fields:

- `id uuid primary key`
- `name text not null`
- `category text not null`
- `insurer_name text null`
- `coverage_amount_kopecks bigint null`
- `validity_days integer not null`
- `base_price_kopecks bigint not null`
- `status text not null default 'active'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Example category:
- `sport`

Future:
- `travel`
- `auto`
- `property`
- `health`

## 8. `federation_products`

Assigns a product and federation-specific price.

Fields:

- `id uuid primary key`
- `federation_id uuid not null references federations(id)`
- `product_id uuid not null references insurance_products(id)`
- `price_kopecks bigint not null`
- `active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

MVP constraint:
- only one active sport product per federation.

This can be relaxed later.

## 9. `applications`

Insurance purchase / issuance request.

Fields:

- `id uuid primary key`
- `person_id uuid not null references persons(id)`
- `federation_id uuid null references federations(id)`
- `product_id uuid not null references insurance_products(id)`
- `federation_product_id uuid null references federation_products(id)`
- `status text not null`
- `amount_kopecks bigint not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

MVP statuses:
- `draft`
- `pending_payment`
- `paid`
- `policy_issued`
- `cancelled`

## 10. `payments`

Fields:

- `id uuid primary key`
- `application_id uuid not null references applications(id)`
- `provider text not null`
- `provider_payment_id text not null`
- `amount_kopecks bigint not null`
- `currency text not null default 'RUB'`
- `status text not null`
- `paid_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

MVP provider:
- `yookassa`

Constraint:
- unique (`provider`, `provider_payment_id`)

Statuses:
- `pending`
- `paid`
- `cancelled`
- `refunded`

## 11. `policies`

Fields:

- `id uuid primary key`
- `application_id uuid not null unique references applications(id)`
- `person_id uuid not null references persons(id)`
- `federation_id uuid null references federations(id)`
- `product_id uuid not null references insurance_products(id)`
- `policy_number text not null unique`
- `status text not null`
- `valid_from date not null`
- `valid_to date not null`
- `policy_url text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Statuses:
- `active`
- `cancelled`
- `expired`

## 12. `external_identities`

Maps OLNOO Person to another platform.

Fields:

- `id uuid primary key`
- `person_id uuid not null references persons(id)`
- `provider text not null`
- `external_id text not null`
- `metadata jsonb null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint:
- unique (`provider`, `external_id`)

Example:

```text
provider = ikigai
external_id = 100427
person_id = <OLNOO person UUID>
```

## 13. `documents`

Fields:

- `id uuid primary key`
- `person_id uuid null references persons(id)`
- `application_id uuid null references applications(id)`
- `type text not null`
- `file_url text not null`
- `status text not null default 'active'`
- `created_at timestamptz not null`

MVP document types may include:
- `policy_pdf`
- `identity_document`
- `other`

## 14. `audit_logs`

Fields:

- `id uuid primary key`
- `account_id uuid null references accounts(id)`
- `action text not null`
- `entity_type text not null`
- `entity_id uuid null`
- `metadata jsonb null`
- `created_at timestamptz not null`

Log at minimum:
- login;
- federation creation/edit;
- federation user creation/edit;
- product assignment;
- payment status changes;
- policy issue/cancel;
- role changes.

## 15. Optional later tables

Do not create unless required:
- `guardianships`
- `organizations`
- `insurers`
- `brokers`
- `commissions`
- `events`
- `event_participants`
- `webhook_deliveries`
- `policy_templates`

## 16. Required indexes

At minimum:

- `persons(last_name, first_name)`
- `federation_memberships(federation_id)`
- `federation_memberships(person_id)`
- `federation_products(federation_id, active)`
- `applications(person_id)`
- `applications(federation_id)`
- `applications(status)`
- `payments(application_id)`
- `payments(status)`
- `policies(person_id)`
- `policies(federation_id)`
- `policies(status)`
- `external_identities(provider, external_id)`

## 17. Access rules

Application/backend authorization must enforce:

### super_admin
All data.

### federation_secretary
Read federation athletes and insurance status for their own federation only.

### federation_director
Same as secretary plus finance for own federation.

### athlete
Only own Person, applications, payments and policies.

### guardian
Reserved for later.

Never trust `federation_id` from client input without checking account membership.

## 18. MVP seed data

Create seed data for development:

- 1 super admin
- 1 federation
- 1 secretary
- 1 director
- 3 athletes
- 1 sport insurance product
- 1 federation product price
- 1 unpaid application
- 1 paid application
- 1 active policy

This seed data is for development only.
