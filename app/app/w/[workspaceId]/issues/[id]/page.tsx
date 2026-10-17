import { workDetailPage } from '@/features/work-items/server-pages';
export default async function Issue({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const { workspaceId, id } = await params; return workDetailPage('issue', workspaceId, id);
}
