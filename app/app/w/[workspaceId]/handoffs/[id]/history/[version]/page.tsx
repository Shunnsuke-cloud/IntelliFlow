import { handoffVersionPage } from '@/features/handoffs/server-pages';
export default async function Page({ params }: { params: Promise<{ workspaceId: string; id: string; version: string }> }) { const { workspaceId, id, version } = await params; return handoffVersionPage(workspaceId, id, version); }
