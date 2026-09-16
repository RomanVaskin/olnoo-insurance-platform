# OLNOO Insurance — Architecture

## 1. Концепция

OLNOO Insurance — универсальная страховая платформа.

Первый рабочий vertical — спортивное страхование.

Архитектура должна позволять добавлять Travel, Auto, Property, Health, Business и другие продукты без перестройки Core.

---

## 2. Общая схема

Frontend / Cabinets
        ↓
OLNOO Insurance Backend API
        ↓
Core Platform
        │
        ├── PostgreSQL
        ├── Products
        ├── Applications
        ├── Payments
        ├── Policies
        ├── Documents
        ├── Organizations
        ├── Partners
        └── Integrations
             │
             ├── Federations
             ├── Brokers
             ├── Insurers
             ├── YooKassa
             ├── OCR
             └── AI Router

---

## 3. Frontend projects

### Main Insurance

Project:

`/opt/olnoo/projects/olnoo-insurance`

Domain:

`insurance.olnoo.com`

Назначение:

- основной сайт;
- marketplace;
- customer interface;
- admin;
- agency;
- federation/partner interfaces.

### Sport Insurance

Project:

`/opt/olnoo/projects/olnoosportinsurance`

Domain:

`sport.insurance.olnoo.com`

Назначение:

- первый продуктовый frontend;
- спортивное страхование;
- соревнования;
- покупка спортивного полиса.

---

## 4. Platform workspace

Project:

`/opt/olnoo/projects/olnoo-insurance-platform`

Назначение:

- архитектура;
- backend;
- database model;
- integrations;
- reusable modules;
- documentation;
- AI instructions.

---

## 5. Backend

На первом этапе используется один backend.

Внутренние части:

core/
products/
modules/
integrations/

Backend является единой точкой работы frontend с:

- Person;
- Products;
- Applications;
- Payments;
- Policies;
- Documents;
- Partners;
- Integrations.

---

## 6. Core

Core содержит только универсальную бизнес-логику.

Основные сущности:

- Person;
- Account;
- Role;
- Organization;
- Partner;
- Product;
- Application;
- Payment;
- Policy;
- Document.

Core не должен знать особенности конкретной федерации или конкретной страховой компании.

---

## 7. Product modules

Пример:

products/
  sport/
  travel/
  auto/
  property/
  health/
  business/

Product module содержит только специфическую логику конкретного направления.

---

## 8. Reusable modules

modules/
  payments/
  documents/
  policy-generator/
  notifications/
  files/

Они используются всеми продуктами.

---

## 9. Integrations

integrations/
  federations/
  insurers/
  brokers/
  payments/

Каждый внешний поставщик подключается через adapter.

---

## 10. Existing external services

### OCR

Service:

`/opt/olnoo/projects/olnoo-ocr`

Используется через API.

### AI Router

Service:

`/opt/olnoo/projects/olnoo-ai-router`

Используется через API.

Backend не должен копировать код этих сервисов.

---

## 11. Серверная архитектура — текущий этап

На первом этапе допускается размещение всей платформы на KZ server.

KZ:

- frontends;
- backend;
- PostgreSQL;
- OCR;
- AI Router;
- integrations;
- policy generation.

Это позволяет быстро запустить продукт.

---

## 12. Будущая серверная архитектура

Позже возможно разделение:

### РФ

- PostgreSQL;
- основной Backend;
- Persons;
- Payments;
- Policies;
- Documents;
- Federation integrations;
- insurers/brokers connectors.

### KZ / AI infrastructure

- AI Router;
- AI models;
- AI document processing;
- local Qwen;
- специализированные AI workers.

Backend должен быть спроектирован так, чтобы это перемещение не требовало изменения frontend.

---

## 13. Federation flow

Federation
    ↓
athlete_id / event_id
    ↓
Federation Connector
    ↓
external_identity
    ↓
OLNOO Person
    ↓
Application
    ↓
Payment
    ↓
Policy
    ↓
Webhook/status API
    ↓
Federation

---

## 14. Policy generation

Policy Generator является универсальным модулем.

Template + structured data → PDF.

После создания шаблона AI для каждого полиса не требуется.

---

## 15. Главный архитектурный принцип

Система должна оставаться модульной, но простой.

Не создавать распределённую микросервисную архитектуру раньше необходимости.
