# OLNOO Insurance — Database Model

## Основной принцип

База данных универсальна для всех страховых продуктов.

Основная сущность клиента — Person.

---

## persons

Реальный человек.

Основные поля:

- id
- first_name
- last_name
- patronymic
- birthdate
- gender
- phone
- email
- created_at
- updated_at

`id` является внутренним постоянным OLNOO person_id.

---

## accounts

Аккаунты для входа.

Person может существовать без собственного Account.

Это необходимо для:

- детей;
- застрахованных третьих лиц;
- участников групповых программ.

---

## external_identities

Связь Person с внешними системами.

Поля:

- id
- person_id
- provider
- external_type
- external_id
- metadata
- created_at

Пример:

provider = ikigai  
external_type = athlete  
external_id = 100427  
person_id = OLNOO UUID

---

## roles

Роли системы.

Примеры:

- customer
- admin
- agency_manager
- federation_manager
- partner_manager
- broker
- insurer_manager

---

## organizations

Универсальные организации.

Типы:

- federation
- club
- event_organizer
- insurer
- broker
- agency
- company
- partner
- other

---

## organization_members

Связь Person/Account с Organization.

---

## insurance_categories

Категории страхования:

- sport
- travel
- health
- auto
- property
- business

---

## insurance_products

Страховые продукты.

Основные поля:

- id
- category_id
- provider_id
- name
- description
- pricing_model
- required_fields
- required_documents
- duration_options
- eligibility_rules
- status

---

## applications

Заявка на страхование.

Основные поля:

- id
- person_id
- product_id
- partner_id
- organization_id
- source
- status
- created_at
- updated_at

---

## application_persons

Застрахованные лица внутри заявки.

Нужно для групповых и семейных продуктов.

---

## payments

Платежи.

Поля:

- id
- application_id
- provider
- external_payment_id
- amount
- currency
- status
- paid_at
- metadata

---

## policies

Полисы.

Поля:

- id
- application_id
- person_id
- product_id
- insurer_id
- policy_number
- valid_from
- valid_to
- amount
- status
- policy_file_id
- created_at

---

## documents

Документы.

Поля:

- id
- person_id
- type
- file_id
- extracted_data
- status
- created_at

Типы могут включать:

- passport
- birth_certificate
- driver_license
- vehicle_document
- property_document
- other

---

## policy_templates

Шаблоны полисов.

Поля:

- id
- insurer_id
- product_id
- version
- template_file_id
- status

---

## policy_template_fields

Размеченные поля шаблона.

Поля:

- template_id
- field_name
- source_path
- page
- x
- y
- width
- font_size
- formatting

---

## events

События/соревнования.

Основные поля:

- id
- organization_id
- name
- date
- location
- status

---

## external_events

Связи событий OLNOO с внешними системами.

---

## event_participants

Участники мероприятия.

Связывает:

- event;
- person;
- discipline;
- category;
- status.

---

## partners

Партнёры продаж.

Поля могут включать:

- id
- organization_id
- commission_model
- commission_rate
- referral_code
- status

---

## integrations

Настройки внешних интеграций.

Например:

- federation
- insurer
- broker
- payment provider

---

## integration_events

Технические события обмена между системами.

Используются для:

- webhook;
- retries;
- audit;
- diagnostics.

---

## ai_jobs

Журнал AI/OCR обработки.

Без хранения чувствительных данных в логах.

Поля:

- id
- document_id
- module
- destination
- request_id
- status
- sent_at
- completed_at
- error_code

---

## audit_logs

Критические действия системы.

Кто, когда и какое действие совершил.

---

## Главное правило

Перед созданием новой таблицы сначала проверить, нельзя ли использовать или расширить существующую универсальную сущность.
