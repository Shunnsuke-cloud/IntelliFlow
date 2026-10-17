import Link from 'next/link';
import { workspaceDetail } from '@/lib/workspaces';
import { flowQuery } from '@/lib/flow';
import { State } from '@/components/ui/controls';
import FlowExplorer from '@/features/flow/components/FlowExplorer';
import { defaultFilters, type FlowBatch, type FlowFilters } from '@/features/flow/types';
import { flowFilters, FlowInputError } from '@/features/flow/validation';
export default async function FlowPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspaceId = (await params).workspaceId; const { client, role } = await workspaceDetail(workspaceId);
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(await searchParams)) if (typeof value === 'string') query.set(key, value); else if (Array.isArray(value)) for (const item of value) query.append(key, item);
  let filters: ReturnType<typeof flowFilters>;
  try { filters = flowFilters(query); }
  catch (error) { if (!(error instanceof FlowInputError)) throw error; return <State title="検索条件を確認してください" error><p>{error.message}</p><Link href={`/app/w/${workspaceId}/flow`}>検索条件をリセットする</Link></State>; }
  const initial = await flowQuery<FlowBatch>(client, workspaceId, 'search', filters);
  const initialFilters: FlowFilters = { ...defaultFilters, ...Object.fromEntries(Object.entries(filters).filter(([key]) => key in defaultFilters)) };
  return <FlowExplorer key={workspaceId + query.toString()} workspaceId={workspaceId} role={role} initial={initial} initialFilters={initialFilters} />;
}
