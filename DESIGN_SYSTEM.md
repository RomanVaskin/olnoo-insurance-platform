# OLNOO Insurance — Design System

## Источник истины

Существующие frontend-проекты являются основными визуальными reference implementations:

Main Insurance:

`/opt/olnoo/projects/olnoo-insurance`

Sport Insurance:

`/opt/olnoo/projects/olnoosportinsurance`

Нельзя redesign существующей системы без отдельного запроса.

---

## Общий стиль

OLNOO Insurance:

- premium minimal;
- чистый интерфейс;
- много воздуха;
- сильная типографика;
- спокойные нейтральные цвета;
- минимум декоративного шума;
- крупные качественные фотографии;
- понятная иерархия;
- аккуратные rounded cards;
- restrained use of accent color.

---

## Что избегать

- generic SaaS шаблонов;
- чрезмерного количества карточек;
- случайных gradients;
- визуального шума;
- чрезмерной анимации;
- изменения существующего дизайна без причины;
- зелёного как основного brand color;
- дешёвых stock-style изображений.

---

## Main Insurance

Основной frontend:

`insurance.olnoo.com`

Reference project:

`/opt/olnoo/projects/olnoo-insurance`

Используется как reference для:

- marketplace;
- admin;
- customer dashboard;
- agency;
- federation;
- product catalog.

---

## Sport Insurance

Frontend:

`sport.insurance.olnoo.com`

Reference project:

`/opt/olnoo/projects/olnoosportinsurance`

Используется как reference для:

- product landing;
- sports imagery;
- competitions;
- sport-specific insurance flow.

---

## Images

Использовать крупные premium фотографии.

Для спортивного направления:

- реальные спортсмены;
- естественная спортивная среда;
- высокая детализация;
- без дешёвого рекламного stock-эффекта.

Существующая композиция изображения должна сохраняться.

Не применять агрессивный crop, если он разрушает исходный кадр.

---

## Reuse

Перед созданием нового UI:

1. проверить существующие components;
2. проверить существующие страницы;
3. использовать существующий pattern;
4. только если pattern отсутствует — создавать новый.

---

## Design Templates

Reference-копии существующих шаблонов находятся в:

`templates/design/`

Они являются reference, а не production-кодом.

Production-код остаётся в frontend repositories.
