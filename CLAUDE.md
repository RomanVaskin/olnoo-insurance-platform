# CLAUDE.md — OLNOO Insurance

Before making architectural or backend changes, read:

1. HOW_TO_USE.md
2. PROJECT_RULES.md
3. ARCHITECTURE.md

If the task affects database structure, also read:

4. DATABASE.md

If the task affects insurance product logic:

5. PRODUCT_MODEL.md

If the task affects personal data or infrastructure:

6. SECURITY.md

If the task affects frontend or UI:

7. DESIGN_SYSTEM.md
8. templates/design/

## Highest priority rule

DO NOT OVERENGINEER.

Always choose the simplest direct reliable solution that fits the existing architecture.

## Architecture constraints

OLNOO Insurance is one universal insurance platform.

Do not create separate independent backends or databases for Sport, Travel, Auto, Property or other insurance verticals unless explicitly approved.

A real person must have one universal OLNOO Person identity.

External IDs such as federation athlete_id must be stored as external identities and mapped to OLNOO person_id.

Reuse common modules:

- payments
- documents
- OCR
- policy generation
- notifications
- storage
- audit

External systems must use connectors/adapters.

Do not place partner-specific logic inside universal Core.

## Change discipline

Before introducing a new entity, service, database, server or abstraction:

1. inspect the existing architecture;
2. check whether an existing component can solve the task;
3. prefer the simpler solution;
4. explain architectural impact before changing architecture.

Do not modify unrelated parts of the project.

## UI

Reuse the existing OLNOO Insurance design.

Do not redesign existing interfaces unless explicitly asked.

Use DESIGN_SYSTEM.md and templates/design/ as visual and implementation references.

## Documentation

When architecture, database or product model changes, update the corresponding documentation.

Do not silently create undocumented architecture.
