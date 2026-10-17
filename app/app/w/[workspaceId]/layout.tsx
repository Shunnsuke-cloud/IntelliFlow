import { workspaceDetail } from '@/lib/workspaces';
import AIProvider from '@/features/ai/components/AIProvider';
export default async function WorkspaceLayout({ params, children }: { params: Promise<{ workspaceId: string }>; children: React.ReactNode }) {
  const { workspace } = await workspaceDetail((await params).workspaceId);
  return <AIProvider key={workspace.id} workspaceId={workspace.id}>{children}</AIProvider>;
}
