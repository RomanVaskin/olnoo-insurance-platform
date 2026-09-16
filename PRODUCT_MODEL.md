# OLNOO Insurance — Product Model

## Концепция

Страховой продукт является конфигурируемой сущностью.

Backend не должен быть построен на большом количестве условий:

if sport
if travel
if auto

---

## Insurance Product

Основные параметры:

- category
- insurer/provider
- name
- description
- required_fields
- required_documents
- eligibility_rules
- pricing_model
- duration_options
- coverage
- commission
- partner_commission
- policy_template
- status

---

## Sport

Первый vertical.

Может использовать:

- sport
- athlete profile
- federation
- event
- discipline
- insurance requirement

При этом Application, Payment, Person, Document и Policy остаются универсальными.

---

## Travel

Будущий vertical.

Добавляет специфические данные:

- destination
- travel dates
- coverage territory
- travel risks

Использует тот же Core.

---

## Auto

Специфические данные:

- vehicle
- VIN
- plate
- driver
- vehicle documents

Использует тот же Core.

---

## Property

Специфические данные:

- property object
- address
- area
- property type
- insured value

Использует тот же Core.

---

## Новый продукт

Чтобы добавить продукт:

1. проверить существующий Core;
2. создать product configuration;
3. добавить только product-specific data;
4. связать необходимые документы;
5. настроить pricing;
6. подключить insurer/broker;
7. добавить policy template;
8. использовать существующие payments и policy generator.

Новый продукт не должен требовать создания нового backend.
