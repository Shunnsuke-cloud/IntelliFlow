import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { workspaceDetail } from '@/lib/workspaces';
import { handoffQuery } from '@/lib/handoffs';
import { HttpError } from '@/lib/auth/server';
import { State } from '@/components/ui/controls';
import { handoffFilters, handoffId, HandoffInputError } from './validation';
import { HandoffList, HandoffForm, HandoffDetailView, SnapshotView } from './components/HandoffUI';
import type { HandoffDetail, HandoffListing, HandoffSeed, SendVersion } from './types';
async function supporting(workspaceId: string) {
  const context = await workspaceDetail(workspaceId); const { data, error } = await context.client.rpc('workspace_people', { target_workspace: workspaceId });
  if (error) throw new Error('メンバーを取得できませんでした。'); return { ...context, people: data ?? [] };
}
export async function handoffListPage(workspaceId: string, search: Record<string, string | string[] | undefined>) {
  const context = await supporting(workspaceId); const params = new URLSearchParams(); const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(search)) if (typeof value === 'string') { params.set(key, value); values[key] = value; } else if (Array.isArray(value)) value.forEach(v => params.append(key, v));
  try { const filters = handoffFilters(params); const listing = await handoffQuery<HandoffListing>(context.client, workspaceId, 'list', filters); return <HandoffList workspaceId={workspaceId} listing={listing} people={context.people} writable={context.role !== 'viewer'} values={values} />; }
  catch (error) { if (!(error instanceof HandoffInputError)) throw error; return <State title="検索条件を確認してください" error><Link href={`/app/w/${workspaceId}/handoffs`}>条件をリセットする</Link></State>; }
}
export async function handoffItemPage(workspaceId: string, id: string | undefined, mode: 'new' | 'edit' | 'detail', sourceId?: string) {
  try { if (id) handoffId(id); if (sourceId) handoffId(sourceId); } catch { notFound(); }
  const context = await supporting(workspaceId); let detail: HandoffDetail | undefined; let seed: HandoffSeed | undefined;
  try { if (id) detail = await handoffQuery(context.client, workspaceId, 'detail', { id }); if (mode === 'new' && sourceId) seed = await handoffQuery(context.client, workspaceId, 'seed', { source_id: sourceId }); }
  catch (error) { if (error instanceof HttpError && error.status === 404) notFound(); throw error; }
  if (mode === 'detail' && detail) return <HandoffDetailView key={`${id}:${detail.item.version}`} workspaceId={workspaceId} detail={detail} people={context.people} userId={context.user.id} role={context.role} />;
  if (context.role === 'viewer' || (detail && (detail.item.archived_at || detail.item.sender_id !== context.user.id || !['draft', 'sent', 'accepted'].includes(detail.item.status)))) return <State title="この引き継ぎを編集する権限がありません" error><Link href={`/app/w/${workspaceId}/handoffs`}>一覧へ</Link></State>;
  return <HandoffForm key={`${id ?? 'new'}:${detail?.item.version ?? sourceId ?? ''}`} workspaceId={workspaceId} people={context.people} userId={context.user.id} detail={detail} seed={seed} />;
}
export async function handoffVersionPage(workspaceId: string, id: string, version: string) {
  try { handoffId(id); } catch { notFound(); } if (!/^[1-9]\d{0,7}$/.test(version)) notFound();
  const { client } = await workspaceDetail(workspaceId); let result: SendVersion;
  try { result = await handoffQuery(client, workspaceId, 'version', { id, version: Number(version) }); }
  catch (error) { if (error instanceof HttpError && error.status === 404) notFound(); throw error; }
  return <><Link className="work-back" href={`/app/w/${workspaceId}/handoffs/${id}`}>← 現在の引き継ぎへ</Link><h1>過去の送信内容</h1><SnapshotView version={result} workspaceId={workspaceId} /></>;
}
