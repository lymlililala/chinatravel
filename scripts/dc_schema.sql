-- ══════════════════════════════════════════════════════════════════════════
-- Discover China — Database Schema
-- Project: tixgzezefjjsyuzgdhcd (Supabase)
-- Prefix: dc_   (avoids collision with existing tables in this project)
--
-- Run this SQL in:
--   Supabase SQL Editor:
--   https://supabase.com/dashboard/project/tixgzezefjjsyuzgdhcd/sql/new
--
--   Or via psql:
--   psql "postgresql://postgres:[DB_PASSWORD]@db.tixgzezefjjsyuzgdhcd.supabase.co:5432/postgres" -f scripts/dc_schema.sql
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. dc_posts ────────────────────────────────────────────────────────────
-- Stores every article/guide published on Discover China.
-- Mirrors the frontmatter fields from the Astro content collection.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dc_posts (
  id            BIGSERIAL     PRIMARY KEY,
  slug          TEXT          NOT NULL UNIQUE,
  file_path     TEXT          NOT NULL,
  title         TEXT          NOT NULL,
  description   TEXT          NOT NULL,
  author        TEXT          NOT NULL DEFAULT 'Discover China Editorial Team',
  tags          TEXT[]        NOT NULL DEFAULT '{}',
  category      TEXT          NOT NULL,
  featured      BOOLEAN       NOT NULL DEFAULT FALSE,
  draft         BOOLEAN       NOT NULL DEFAULT FALSE,
  pub_datetime  TIMESTAMPTZ   NOT NULL,
  mod_datetime  TIMESTAMPTZ,
  og_image      TEXT,
  content       TEXT          NOT NULL,
  word_count    INT           GENERATED ALWAYS AS (
                  array_length(regexp_split_to_array(trim(content), '\s+'), 1)
                ) STORED,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dc_posts_idx_slug      ON dc_posts (slug);
CREATE INDEX IF NOT EXISTS dc_posts_idx_category  ON dc_posts (category);
CREATE INDEX IF NOT EXISTS dc_posts_idx_tags      ON dc_posts USING GIN (tags);
CREATE INDEX IF NOT EXISTS dc_posts_idx_featured  ON dc_posts (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS dc_posts_idx_pub       ON dc_posts (pub_datetime DESC);

ALTER TABLE dc_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dc_posts' AND policyname = 'dc_posts_public_read'
  ) THEN
    CREATE POLICY dc_posts_public_read ON dc_posts
      FOR SELECT TO anon USING (draft = FALSE);
  END IF;
END $$;


-- ── 2. dc_destinations ─────────────────────────────────────────────────────
-- Featured destination cards shown on the homepage grid.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dc_destinations (
  id          BIGSERIAL   PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  tagline     TEXT        NOT NULL,
  image_url   TEXT        NOT NULL,
  image_alt   TEXT        NOT NULL,
  tag         TEXT        NOT NULL,
  highlights  TEXT[]      NOT NULL DEFAULT '{}',
  sort_order  INT         NOT NULL DEFAULT 0,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dc_destinations_idx_tag   ON dc_destinations (tag);
CREATE INDEX IF NOT EXISTS dc_destinations_idx_order ON dc_destinations (sort_order);

ALTER TABLE dc_destinations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dc_destinations' AND policyname = 'dc_destinations_public_read'
  ) THEN
    CREATE POLICY dc_destinations_public_read ON dc_destinations
      FOR SELECT TO anon USING (active = TRUE);
  END IF;
END $$;


-- ── 3. dc_subscribers ──────────────────────────────────────────────────────
-- Newsletter email captures from the homepage / article footer forms.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dc_subscribers (
  id              BIGSERIAL   PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  source          TEXT        NOT NULL DEFAULT 'homepage',
  confirmed       BOOLEAN     NOT NULL DEFAULT FALSE,
  confirm_token   TEXT,
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dc_subscribers_idx_email     ON dc_subscribers (email);
CREATE INDEX IF NOT EXISTS dc_subscribers_idx_confirmed ON dc_subscribers (confirmed);

ALTER TABLE dc_subscribers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dc_subscribers' AND policyname = 'dc_subscribers_insert'
  ) THEN
    -- Only anonymous users can insert (for newsletter signup)
    CREATE POLICY dc_subscribers_insert ON dc_subscribers
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;


-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT
  table_name,
  (SELECT count(*) FROM information_schema.columns c2 WHERE c2.table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name LIKE 'dc_%'
ORDER BY table_name;
