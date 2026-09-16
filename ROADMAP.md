# OLNOO Insurance — Roadmap

## Phase 1 — Platform Core

Создать:

- PostgreSQL;
- Person;
- Accounts;
- Roles;
- Organizations;
- External identities;
- Products;
- Applications;
- Payments;
- Policies;
- Documents.

---

## Phase 2 — Sport end-to-end

Реализовать полный сценарий:

Federation athlete
→ OLNOO Person
→ Application
→ Payment
→ Policy
→ PDF
→ Federation insurance status.

---

## Phase 3 — Federation Connector

Первая интеграция:

ikigai-world.ru

Реализовать:

- athlete mapping;
- event mapping;
- signed purchase link;
- webhook;
- status API.

---

## Phase 4 — Existing modules

Подключить:

- OCR;
- payment module;
- policy generator;
- notifications.

---

## Phase 5 — Admin

Подключить существующий admin frontend к реальной базе.

Основные разделы:

- persons;
- applications;
- payments;
- policies;
- products;
- partners;
- organizations;
- integrations;
- documents;
- analytics.

---

## Phase 6 — Insurer/Broker integration

Подключить реальные продукты страховых компаний и брокеров.

---

## Phase 7 — Second insurance vertical

Подключить второй продукт, например Travel.

Цель:

проверить, что новый vertical подключается без перестройки Core.

---

## Phase 8 — RF/KZ split

При необходимости:

РФ:
- PostgreSQL
- Backend
- Documents
- Payments
- Policies

KZ:
- AI
- OCR/AI processing
- AI Router

---

## Phase 9 — Local AI

Возможность использовать local Qwen/Qwen-VL для обработки документов и внутренних AI-задач.
