import type { ReactNode } from 'react';
import AppShell from '@/components/layout/AppShell';
import { workspaceList } from '@/lib/workspaces';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, workspaces } = await workspaceList();
  return <AppShell workspaces={workspaces} email={user.email ?? 'ユーザー'}>{children}</AppShell>;
}
