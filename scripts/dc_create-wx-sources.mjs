/**
 * 建表：dc_wx_sources —— 采集到的公众号原文落库（替代本地 data/sources.json，
 * 解决 CI 跨运行不保留、无法跨天去重的问题）。与 dc_posts 同库。
 *
 * 用法：
 *   # 自动建（需 Postgres 直连串，一次性）：
 *   DATABASE_URL="postgresql://postgres:[DB_PASSWORD]@db.tixgzezefjjsyuzgdhcd.supabase.co:5432/postgres" \
 *     node scripts/dc_create-wx-sources.mjs
 *   # 无 DATABASE_URL：打印 SQL，去 Supabase SQL Editor 粘贴执行。
 *
 * Supabase project: tixgzezefjjsyuzgdhcd
 */

import { existsSync } from 'node:fs'
import pkg from 'pg'
const { Client } = pkg

if (existsSync('.env')) process.loadEnvFile('.env')

const DATABASE_URL = process.env.DATABASE_URL

const CREATE_WX_SOURCES = `
CREATE TABLE IF NOT EXISTS dc_wx_sources (
  sn            TEXT          PRIMARY KEY,
  account       TEXT,
  wxid          TEXT,
  title         TEXT,
  digest        TEXT,
  content_url   TEXT,
  published_at  TIMESTAMPTZ,
  body_text     TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dc_wx_sources_idx_pub ON dc_wx_sources (published_at DESC);

ALTER TABLE dc_wx_sources ENABLE ROW LEVEL SECURITY;
-- 内部数据：不创建任何 anon 读策略（仅 service_role / secret key 可读写）。
`.trim()

async function main() {
  if (!DATABASE_URL) {
    console.log('⚠️  未设置 DATABASE_URL —— DDL 无法经 REST 执行。')
    console.log('👉 打开 https://supabase.com/dashboard/project/tixgzezefjjsyuzgdhcd/sql/new')
    console.log('   粘贴并执行下面的 SQL：\n')
    console.log('─'.repeat(68))
    console.log(CREATE_WX_SOURCES)
    console.log('─'.repeat(68))
    console.log('\n（或设置 DATABASE_URL 后重跑本脚本自动建表。）')
    return
  }

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query(CREATE_WX_SOURCES)
    console.log('✅ dc_wx_sources 已创建（或已存在）。')
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
