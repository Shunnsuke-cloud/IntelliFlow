import { wikiItemPage } from '@/features/wiki/server-pages';
export default async function WikiDetail({ params }: { params: Promise<{ workspaceId: string; id: string }> }) { const { workspaceId, id } = await params; return wikiItemPage(workspaceId, id, 'detail'); }
