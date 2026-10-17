import { workspaceDetail } from '@/lib/workspaces';
export default async function WorkspaceLayout({ params, children }: { params: Promise<{ workspaceId: string }>; children: React.ReactNode }) {
  await workspaceDetail((await params).workspaceId); return children;
}
