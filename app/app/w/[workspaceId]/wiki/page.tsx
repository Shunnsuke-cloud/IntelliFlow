import { wikiListPage } from '@/features/wiki/server-pages';
export default async function Wiki({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return wikiListPage((await params).workspaceId, await searchParams); }
