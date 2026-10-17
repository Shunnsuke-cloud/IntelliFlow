import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { workspaceDetail } from '@/lib/workspaces';
import { wikiQuery } from '@/lib/wiki';
import { HttpError } from '@/lib/auth/server';
import { uuid } from '@/features/work-items/validation';
import { canManage } from '@/lib/auth/policy';
import { State } from '@/components/ui/controls';
import { WikiList, WikiForm, WikiDetailView } from './components/WikiUI';
import WikiBody from './components/WikiBody';
import type { WikiDetail, WikiOptions, WikiListing, WikiRevision } from './types';
import type { Json } from '@/lib/supabase/database';
async function supporting(workspaceId: string) {
  const context = await workspaceDetail(workspaceId);
  const [options, people] = await Promise.all([wikiQuery<WikiOptions>(context.client, workspaceId, 'options'), context.client.rpc('workspace_people', { target_workspace: workspaceId })]);
  if (people.error) throw new Error('メンバーを取得できませんでした。');
  return { ...context, options, people: people.data ?? [] };
}
export async function wikiListPage(workspaceId: string, search: Record<string, string | string[] | undefined>) {
  const context = await supporting(workspaceId); const values: Record<string, string> = {}; const filters: Record<string, Json> = {};
  for (const [key, value] of Object.entries(search)) if (typeof value === 'string') values[key] = value;
  if ((values.q?.length ?? 0) > 200 || (values.category?.length ?? 0) > 40 || (values.status && !['draft', 'published'].includes(values.status)) || (values.archived && !['true', 'false'].includes(values.archived)) || (values.offset && !/^\d{1,7}$/.test(values.offset))) return <State title="検索条件を確認してください" error><Link href={`/app/w/${workspaceId}/wiki`}>条件をリセットする</Link></State>;
  for (const key of ['q', 'category', 'status']) if (values[key]) filters[key] = values[key];
  filters.archived = values.archived === 'true'; filters.offset = Number(values.offset ?? 0);
  const listing = await wikiQuery<WikiListing>(context.client, workspaceId, 'list', filters);
  return <WikiList workspaceId={workspaceId} listing={listing} options={context.options} role={context.role} values={values} />;
}
export async function wikiItemPage(workspaceId: string, id: string | undefined, mode: 'detail' | 'edit' | 'new') {
  if (id) try { uuid(id); } catch { notFound(); }
  const context = await supporting(workspaceId); let detail: WikiDetail | undefined;
  try { if (id) detail = await wikiQuery(context.client, workspaceId, 'detail', { id }); }
  catch (error) { if (error instanceof HttpError && error.status === 404) notFound(); throw error; }
  if (mode === 'detail' && detail) return <WikiDetailView workspaceId={workspaceId} detail={detail} options={context.options} people={context.people} role={context.role} userId={context.user.id} />;
  const page = detail?.page;
  if (context.role === 'viewer' || page?.archived_at || (page?.status === 'draft' && page.created_by !== context.user.id && !canManage(context.role))) return <State title="このページを編集する権限がありません" error><Link href={`/app/w/${workspaceId}/wiki`}>Wiki一覧へ</Link></State>;
  return <WikiForm workspaceId={workspaceId} detail={detail} options={context.options} role={context.role} userId={context.user.id} />;
}
export async function wikiRevisionPage(workspaceId: string, id: string, revision: string) {
  try { uuid(id); } catch { notFound(); } if (!/^[1-9]\d{0,7}$/.test(revision)) notFound();
  const { client } = await workspaceDetail(workspaceId); let version: WikiRevision;
  try { version = await wikiQuery(client, workspaceId, 'revision', { id, revision: Number(revision) }); }
  catch (error) { if (error instanceof HttpError && error.status === 404) notFound(); throw error; }
  return <><Link className="work-back" href={`/app/w/${workspaceId}/wiki/${id}`}>← 現在のページへ</Link><p className="if-kicker">過去のバージョン · 第{version.revision}版</p><h1>{version.title}</h1><p className="work-subtle">{new Date(version.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} · {version.metadata.category ?? '未分類'} · {version.metadata.status === 'draft' ? '下書き' : '共有'}</p><section className="wiki-reading"><WikiBody document={version.body_doc} workspaceId={workspaceId} /></section></>;
}
