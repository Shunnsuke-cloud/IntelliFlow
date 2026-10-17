import { handoffItemPage } from '@/features/handoffs/server-pages';
export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ source_id?: string }> }) { return handoffItemPage((await params).workspaceId, undefined, 'new', (await searchParams).source_id); }
