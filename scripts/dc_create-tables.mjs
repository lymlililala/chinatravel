/**
 * Creates all Discover China (dc_) tables in Supabase.
 *
 * Tables created (all prefixed with dc_ to avoid collisions):
 *   dc_posts       — article / guide metadata + content
 *   dc_destinations — featured destination cards
 *   dc_subscribers  — newsletter email capture
 *
 * Usage:
 *   node scripts/dc_create-tables.mjs
 *
 * Supabase project: tixgzezefjjsyuzgdhcd
 */

import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Load .env (gitignored) so the secret key never lives in a tracked file.
if (existsSync('.env')) process.loadEnvFile('.env')

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://tixgzezefjjsyuzgdhcd.supabase.co'
// New-format Supabase secret key (sb_secret_…), read from the environment only.
// Set it in .env (local) or as a Vercel env var — never hardcode it here.
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_SECRET_KEY) {
  console.error('❌ Missing SUPABASE_SECRET_KEY. Set it in .env or the environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)

// ─── SQL Definitions ──────────────────────────────────────────────────────────

/**
 * dc_posts
 * Stores every article/guide published on Discover China.
 * Mirrors the frontmatter fields from the Astro content collection.
 */
const CREATE_POSTS_TABLE = `
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
                    array_length(regexp_split_to_array(trim(content), '\\s+'), 1)
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
`

/**
 * dc_destinations
 * Featured destination cards shown on the homepage grid.
 */
const CREATE_DESTINATIONS_TABLE = `
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
`

/**
 * dc_subscribers
 * Newsletter email captures from the homepage / article footer forms.
 */
const CREATE_SUBSCRIBERS_TABLE = `
  CREATE TABLE IF NOT EXISTS dc_subscribers (
    id           BIGSERIAL   PRIMARY KEY,
    email        TEXT        NOT NULL UNIQUE,
    source       TEXT        NOT NULL DEFAULT 'homepage',
    confirmed    BOOLEAN     NOT NULL DEFAULT FALSE,
    confirm_token TEXT,
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS dc_subscribers_idx_email     ON dc_subscribers (email);
  CREATE INDEX IF NOT EXISTS dc_subscribers_idx_confirmed ON dc_subscribers (confirmed);

  ALTER TABLE dc_subscribers ENABLE ROW LEVEL SECURITY;

  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'dc_subscribers' AND policyname = 'dc_subscribers_insert'
    ) THEN
      CREATE POLICY dc_subscribers_insert ON dc_subscribers
        FOR INSERT TO anon WITH CHECK (true);
    END IF;
  END $$;
`

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function tableExists(tableName) {
  const { error } = await supabase.from(tableName).select('id').limit(1)
  return !error
}

async function runSQL(label, sql) {
  console.log(`\n📦 Creating table: ${label}`)
  const { error } = await supabase.rpc('exec_sql', { query: sql }).single()

  if (error) {
    // Supabase doesn't expose a raw SQL RPC by default;
    // fall back to the REST endpoint approach that creates via PostgREST.
    // We'll use a workaround: try a direct fetch to the management API.
    // For standard Supabase projects the safest path is the pg connection.
    // Here we show the SQL and guide the user.
    console.warn(`  ⚠️  Cannot run DDL via REST (expected). SQL saved — see instructions below.`)
    return false
  }
  console.log(`  ✅ ${label} created.`)
  return true
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Discover China — Supabase table setup')
  console.log(`   Project: tixgzezefjjsyuzgdhcd`)
  console.log(`   Prefix:  dc_\n`)

  const tables = [
    { name: 'dc_posts',        sql: CREATE_POSTS_TABLE },
    { name: 'dc_destinations', sql: CREATE_DESTINATIONS_TABLE },
    { name: 'dc_subscribers',  sql: CREATE_SUBSCRIBERS_TABLE },
  ]

  // Check which tables already exist
  const status = await Promise.all(
    tables.map(async t => ({ ...t, exists: await tableExists(t.name) }))
  )

  const existing = status.filter(t => t.exists).map(t => t.name)
  const toCreate = status.filter(t => !t.exists)

  if (existing.length > 0) {
    console.log('✅ Already exists:', existing.join(', '))
  }

  if (toCreate.length === 0) {
    console.log('\n🎉 All tables already exist! Run the seed script next:')
    console.log('   node scripts/dc_seed.mjs')
    return
  }

  // Supabase REST API does not support DDL directly.
  // Print the SQL to run in the Supabase SQL Editor.
  console.log('\n' + '═'.repeat(68))
  console.log('⚠️  DDL must be run in the Supabase SQL Editor (one-time setup)')
  console.log('═'.repeat(68))
  console.log('\n👉 Open: https://supabase.com/dashboard/project/tixgzezefjjsyuzgdhcd/sql/new')
  console.log('\nPaste the following SQL:\n')
  console.log('─'.repeat(68))

  for (const t of toCreate) {
    console.log(`-- ── ${t.name} ${'─'.repeat(50 - t.name.length)}`)
    console.log(t.sql.trim())
    console.log()
  }

  console.log('─'.repeat(68))
  console.log('\nAfter running the SQL, execute the seed script:')
  console.log('   node scripts/dc_seed.mjs\n')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
