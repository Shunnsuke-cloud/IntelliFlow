import { handoffListPage } from '@/features/handoffs/server-pages';
export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return handoffListPage((await params).workspaceId, await searchParams); }
