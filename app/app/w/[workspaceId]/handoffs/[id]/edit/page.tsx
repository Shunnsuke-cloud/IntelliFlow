import { handoffItemPage } from '@/features/handoffs/server-pages';
export default async function Page({ params }: { params: Promise<{ workspaceId: string; id: string }> }) { const { workspaceId, id } = await params; return handoffItemPage(workspaceId, id, 'edit'); }
