import { workListPage } from '@/features/work-items/server-pages';
export default async function Issues({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return workListPage('issue', (await params).workspaceId, await searchParams);
}
