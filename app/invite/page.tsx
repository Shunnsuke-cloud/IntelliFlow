import { AcceptInvitation } from '@/features/workspaces/components/WorkspaceForms';
export const metadata = { title: '招待への参加 | IntelliFlow', referrer: 'no-referrer' as const };
export default function Invite() { return <main className="page-shell"><a href="/app">IntelliFlow</a><h1>ワークスペースへの招待</h1><AcceptInvitation /></main>; }
