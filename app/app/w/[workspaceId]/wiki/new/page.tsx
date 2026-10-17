import { wikiItemPage } from '@/features/wiki/server-pages';
export default async function NewWiki({ params }: { params: Promise<{ workspaceId: string }> }) { return wikiItemPage((await params).workspaceId, undefined, 'new'); }
