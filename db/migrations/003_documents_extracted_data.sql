-- OLNOO Insurance Platform — documents.extracted_data (MVP V1)
-- Adds a place to persist confirmed OCR output (see DATABASE.md `documents`, which
-- already documents this field). Applies after 001_init_schema.sql and
-- 002_auth_sessions.sql. Does not modify either.

ALTER TABLE documents ADD COLUMN extracted_data JSONB NULL;
