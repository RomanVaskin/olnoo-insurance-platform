# OLNOO Insurance Platform — MVP V1

Version: 1.0  
Date: 2026-09-16

## 1. Goal

Build the first working version of OLNOO Insurance as one universal insurance platform for federations, athletes, policies, payments and future insurance verticals.

The first release is focused on sport insurance, but the core must remain reusable for Travel, Auto, Property and other products.

## 2. Domains

- `admin.insurance.olnoo.com` — OLNOO admin, federation secretary, federation director
- `insurance.olnoo.com/account` — athlete / client account
- `sport.insurance.olnoo.com` — sport insurance public frontend

## 3. Core principle

One platform:
- one backend;
- one PostgreSQL database;
- one authentication system;
- one Person model;
- multiple organizations;
- multiple insurance products;
- multiple integrations.

Do not create separate backends or databases per federation or insurance type.

## 4. Roles

### `super_admin`
OLNOO administrator.

Can:
- create and edit federations;
- create federation users;
- create and edit insurance products;
- assign products and prices to federations;
- see all athletes;
- see all applications;
- see all payments;
- see all policies;
- see all finance and analytics.

### `federation_secretary`
Federation secretary.

Can see only their federation:
- athletes;
- athlete profile data;
- insurance status;
- policy number;
- policy validity;
- applications;
- send/open insurance purchase flow.

Cannot see financial dashboards that are restricted to the federation director.

### `federation_director`
Federation director.

Can see everything the secretary sees, plus:
- number of policies sold;
- total paid amount;
- refunds;
- financial reports;
- sales analytics.

### `athlete`
Athlete account.

Can see:
- personal data;
- federation;
- assigned insurance product;
- insurance status;
- current policy;
- policy PDF;
- payments;
- purchase insurance.

### `guardian`
Reserved for a parent / legal representative of a minor athlete.

Not required for MVP V1 UI, but the data model must not prevent adding it later.

## 5. Main entities

- Account
- Person
- Federation
- FederationUser
- FederationMembership
- InsuranceProduct
- FederationProduct
- Application
- Payment
- Policy
- ExternalIdentity
- Document
- AuditLog

## 6. Federation workflow

1. OLNOO admin creates a federation.
2. OLNOO admin creates federation secretary access.
3. OLNOO admin creates federation director access.
4. OLNOO admin assigns an insurance product to the federation.
5. OLNOO admin sets the federation-specific price.
6. Federation users can access only their federation data.
7. Athletes belonging to the federation see the assigned product in their account.

## 7. Product assignment

An athlete does not choose a sport insurance tariff from a public catalogue in MVP V1.

The effective product is determined by:

`Person → FederationMembership → Federation → FederationProduct → InsuranceProduct`

Example:

- Federation: Федерация всестилевого каратэ России
- Product: Спортивная страховка
- Coverage: 500 000 ₽
- Validity: 365 days
- Federation price: 1 500 ₽

## 8. Athlete account

Route:

`insurance.olnoo.com/account`

Sections:
- My data
- My federation
- My insurance
- Buy insurance
- Payments
- Download policy

Purchase button must use the product assigned to the athlete's federation.

## 9. Purchase flow

1. Athlete opens assigned insurance product.
2. User clicks `Купить`.
3. OLNOO creates `Application`.
4. OLNOO creates YooKassa payment.
5. User pays in YooKassa.
6. YooKassa webhook confirms payment.
7. `Payment.status = paid`.
8. OLNOO issues / creates a policy.
9. `Policy.status = active`.
10. Athlete account shows policy number, validity and PDF.
11. Federation secretary sees athlete as insured.
12. Federation director sees the sale in finance.

Payment success must be based on YooKassa webhook, not only browser redirect.

## 10. Admin structure

### Dashboard
- total federations
- total athletes
- active policies
- applications
- paid amount

### Federations
- federation list
- create/edit federation
- secretary
- director
- athletes
- assigned products
- finance

### Insurance
- products
- federation prices
- applications
- policies
- payments

### Clients
- persons
- accounts
- documents

### System
- users
- integrations
- audit log
- settings

Sport-specific entities may later appear under a dedicated `Sport` module.

## 11. Federation secretary UI

Required views:
- athlete list;
- athlete search;
- athlete card;
- insured / not insured status;
- policy number;
- valid from / valid to;
- policy link;
- assigned insurance product.

## 12. Federation director UI

Same as secretary plus:
- policies sold;
- amount paid;
- refunds;
- date filtering;
- federation finance summary.

## 13. Athlete import / external platform

MVP core must support external athlete IDs.

Use `ExternalIdentity`, never replace OLNOO `Person.id` with external `athlete_id`.

Example:

- provider: `ikigai`
- external_id: `100427`
- person_id: internal OLNOO UUID

Do not implement full IKIGAI integration until the local platform flow works end-to-end.

## 14. Security / access boundaries

- Federation users can only access their federation.
- Athletes can only access their own Person / policies / payments.
- Financial federation views are restricted to director and super_admin.
- Passwords are never stored in plain text.
- Sensitive actions must be logged in AuditLog.
- No direct database access is exposed to external federation platforms.

## 15. MVP acceptance criteria

MVP V1 is complete when this full flow works:

`Admin creates federation`
→ `Admin creates secretary/director`
→ `Admin assigns product and federation price`
→ `Athlete exists`
→ `Athlete logs in`
→ `Athlete sees assigned product`
→ `Athlete pays via YooKassa`
→ `Payment is confirmed by webhook`
→ `Policy is created`
→ `Athlete sees policy`
→ `Secretary sees insured status`
→ `Director sees the sale and amount`

## 16. Explicitly out of scope for MVP V1

Do not build yet:
- microservices;
- separate databases per federation;
- Travel / Auto / Property purchase flows;
- complex commission engine;
- full IKIGAI synchronization;
- insurer/broker connectors unless required for policy issuance;
- advanced BI;
- multi-currency;
- multiple sport products per athlete;
- automatic parent/guardian workflows.

## 17. Implementation rule

Prefer the simplest direct implementation.

Do not add abstractions, services or infrastructure that are not required for the acceptance criteria above.
