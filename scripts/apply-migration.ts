/**
 * Supabase 마이그레이션 적용 스크립트
 *
 * 사용법:
 *   DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres \
 *     npx tsx scripts/apply-migration.ts 003_attachments.sql
 *
 * DATABASE_URL 은 Supabase 대시보드 > Project Settings > Database > Connection string
 * 에서 복사 (URI 형식, service role password 포함).
 *
 * 참고: 현재 프로젝트는 @supabase/supabase-js 만 쓰고 있어서 SQL 직접 실행이 불가능하다.
 * 이 스크립트만 node-postgres(pg) 를 임시로 require 한다.
 * pg 가 설치돼 있지 않으면 SQL 을 stdout 에 출력하고 종료 → Supabase SQL Editor 에 붙여넣기.
 */

import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const file = process.argv[2] || '003_attachments.sql';
  const sqlPath = path.resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    file
  );
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Migration file not found: ${sqlPath}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('ℹ️  DATABASE_URL 이 설정되지 않음.');
    console.log(
      'ℹ️  아래 SQL 을 Supabase 대시보드 > SQL Editor 에 복사해서 실행하세요:'
    );
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
    return;
  }

  let Client: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Client = require('pg').Client;
  } catch {
    console.error(
      '❌ pg 모듈이 필요합니다. `npm install --save-dev pg @types/pg` 후 다시 실행하세요.'
    );
    console.log('\n또는 위 SQL 을 Supabase SQL Editor 에 직접 붙여넣으세요.');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log(`📦 Applying: ${file}`);
  try {
    await client.query(sql);
    console.log('✅ Migration applied.');
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
