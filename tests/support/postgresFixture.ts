import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';

// Real repository migrations run in an isolated PostgreSQL engine. The three
// platform schemas are stubbed; every application table, policy and trigger is
// created from the SQL used in production. No production records are touched.
export async function postgresFixture(beforeMigration?: (db: PGlite, name: string) => Promise<void>) {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE SCHEMA realtime; CREATE TABLE realtime.messages(extension text);
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT 'test'::text $$;
    CREATE FUNCTION realtime.broadcast_changes(text,text,text,text,text,record,record) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;`);
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  for (const file of readdirSync(dir).filter(name=>name.endsWith('.sql')).sort()) {
    await beforeMigration?.(db,file);
    await db.exec(readFileSync(new URL(file,dir),'utf8'));
  }
  return db;
}
