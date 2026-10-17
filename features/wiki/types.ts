import type { WikiNode } from './document';
export type WikiSummary = { id: string; title: string; workspace_id: string; category: string; parent_id: string | null; status: 'draft' | 'published'; current_revision: number; created_by: string; version: number; updated_at: string; archived_at: string | null };
export type WikiPage = WikiSummary & { body_doc: WikiNode; body: string };
export type WikiRelation = { id: string; title: string; kind: 'issue' | 'project'; archived_at: string | null };
export type WikiRevision = { id: string; revision: number; title: string; edited_by: string; created_at: string; metadata: { action?: string; status?: string; category?: string; parent_id?: string | null }; body_doc?: WikiNode };
export type WikiDetail = { page: WikiPage; relations: WikiRelation[]; revisions: WikiRevision[] };
export type WikiListing = { items: WikiSummary[]; total: number; offset: number; limit: number };
export type WikiOptions = { pages: WikiSummary[]; categories: string[] };
