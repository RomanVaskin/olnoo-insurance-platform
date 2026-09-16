# HOW TO USE — OLNOO Insurance Platform

## Что это за папка

`olnoo-insurance-platform` — это главное рабочее пространство всей платформы OLNOO Insurance.

Здесь хранятся:

- архитектура;
- правила проекта;
- структура базы данных;
- продуктовая модель;
- безопасность;
- интеграции;
- документация по видам страхования;
- reusable-модули;
- инструкции для Claude, ChatGPT, Codex и разработчиков.

Важно:

это не frontend-сайт и не отдельный страховой продукт.

Рабочие frontend-проекты находятся отдельно:

- `/opt/olnoo/projects/olnoo-insurance`
- `/opt/olnoo/projects/olnoosportinsurance`

OCR и AI-сервисы тоже находятся отдельно:

- `/opt/olnoo/projects/olnoo-ocr`
- `/opt/olnoo/projects/olnoo-ai-router`

---

# С чего начинать работу

Перед любой серьёзной задачей сначала открыть:

1. `README_PLATFORM.md`
2. `PROJECT_RULES.md`
3. `ARCHITECTURE.md`

Если задача касается базы данных:

4. `DATABASE.md`

Если задача касается страховых продуктов:

5. `PRODUCT_MODEL.md`

Если задача касается безопасности:

6. `SECURITY.md`

Если задача касается интерфейса:

7. `DESIGN_SYSTEM.md`

---

# Главное правило

Правило №1:

> НЕ УСЛОЖНЯТЬ.
> Всегда сначала искать самый простой, прямой и надёжный путь.

Не создавать:

- новый сервис;
- новую базу;
- новый сервер;
- новую сущность;
- новый архитектурный слой;

если задача может быть нормально решена существующей структурой.

---

# Как работать с Claude

Если работа идёт в Claude, сначала дать ему указание:

> Before making changes, read README_PLATFORM.md, PROJECT_RULES.md and ARCHITECTURE.md.
> If the task affects database structure, also read DATABASE.md.
> If the task affects insurance products, also read PRODUCT_MODEL.md.
> Do not redesign the architecture without explicit approval.

Для Claude основным служебным файлом является:

`CLAUDE.md`

Но `CLAUDE.md` не заменяет остальные документы.

---

# Как работать с ChatGPT

Если проект открывает другой человек в ChatGPT, ему нужно сначала дать:

- `README_PLATFORM.md`
- `HOW_TO_USE.md`
- `PROJECT_RULES.md`
- `ARCHITECTURE.md`

Если задача касается БД:

- `DATABASE.md`

Если интеграции:

- соответствующий файл из `docs/integrations/`

Если конкретного продукта:

- соответствующую папку из `docs/products/`

---

# Как работать с Codex

Codex должен запускаться из нужного проекта.

Для backend-платформы:

```bash
cd /opt/olnoo/projects/olnoo-insurance-platform
