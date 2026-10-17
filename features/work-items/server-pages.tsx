import 'server-only';
import { notFound } from 'next/navigation';
import { workspaceDetail } from '@/lib/workspaces';
import { queryItems } from '@/lib/work-items';
import { HttpError } from '@/lib/auth/server';
import { wikiQuery } from '@/lib/wiki';
import type { WikiSummary } from '@/features/wiki/types';
import { State } from '@/components/ui/controls';
import { WorkList, WorkDetail } from './components/WorkUI';
import { InputError, uuid, validateFilters } from './validation';
import type { WorkKind, Options, Person, Listing, Detail, Issue, Project } from './types';
type Search = Record<string, string | string[] | undefined>;
async function supporting(workspaceId: string) {
  const context = await workspaceDetail(workspaceId);
  const [options, people] = await Promise.all([
    queryItems<Options>(context.client, workspaceId, 'options'),
    context.client.rpc('workspace_people', { target_workspace: workspaceId }),
  ]);
  if (people.error) throw new Error('メンバー一覧を読み込めませんでした。');
  return { ...context, options, people: (people.data ?? []) as Person[] };
}
export async function workListPage(kind: WorkKind, workspaceId: string, search: Search) {
  const context = await supporting(workspaceId);
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(search)) if (typeof value === 'string') values[key] = value;
  try {
    const filters = validateFilters(new URLSearchParams(values));
    const listing = await queryItems<Listing<Issue | Project>>(context.client, workspaceId, kind === 'issue' ? 'issues' : 'projects', filters);
    return <WorkList kind={kind} workspaceId={workspaceId} listing={listing} role={context.role} people={context.people} options={context.options} values={values} />;
  } catch (error) {
    if (error instanceof InputError) return <State title="検索条件を確認してください" error><p>{error.message}</p><a href={`/app/w/${workspaceId}/${kind === 'issue' ? 'issues' : 'projects'}`}>条件をリセットする</a></State>;
    throw error;
  }
}
export async function workDetailPage(kind: WorkKind, workspaceId: string, id: string) {
  try { uuid(id); } catch { notFound(); }
  const context = await supporting(workspaceId);
  try {
    const detail = await queryItems<Detail<Issue | Project>>(context.client, workspaceId, 'detail', { id, kind });
    const related = kind === 'project' ? await queryItems<Listing<Issue>>(context.client, workspaceId, 'issues', { project: id, limit: 100, sort: 'number' }) : undefined;
    let relatedWiki: WikiSummary[] = []; let wikiError = false;
    try { relatedWiki = await wikiQuery(context.client, workspaceId, 'backlinks', { id }); } catch { wikiError = true; }
    return <WorkDetail kind={kind} workspaceId={workspaceId} detail={detail} relatedIssues={related} relatedWiki={relatedWiki} wikiError={wikiError} role={context.role} userId={context.user.id} people={context.people} options={context.options} />;
  } catch (error) { if (error instanceof HttpError && error.status === 404) notFound(); throw error; }
}
