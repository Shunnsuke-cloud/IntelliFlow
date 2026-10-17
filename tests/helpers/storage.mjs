// Minimal Storage catalog/privileges for isolated SQL tests; never a live Supabase project.
export async function installStorageSchema(db) {
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb not null default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.buckets to authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`);
}
