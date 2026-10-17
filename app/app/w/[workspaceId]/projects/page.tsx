import { workListPage } from '@/features/work-items/server-pages';
export default async function Projects({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return workListPage('project', (await params).workspaceId, await searchParams);
}
