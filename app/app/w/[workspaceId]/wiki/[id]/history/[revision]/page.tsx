import { wikiRevisionPage } from '@/features/wiki/server-pages';
export default async function Revision({ params }: { params: Promise<{ workspaceId: string; id: string; revision: string }> }) { const { workspaceId, id, revision } = await params; return wikiRevisionPage(workspaceId, id, revision); }
