import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './supabase/database';
import { HttpError } from './auth/server';
import { workError } from './work-items';
import type { AIStatus, AIFeature } from '@/features/ai/types';
import type { FlowBatch, FlowNode } from '@/features/flow/types';
import { searchPlan } from '@/features/ai/validation';
export type AIContext = FlowNode & { details: Json };
export type AIState = AIStatus & { settings_revision: number; preference_revision: number };
type Client = SupabaseClient<Database>;
export async function aiStatus(client: Client, workspaceId: string): Promise<AIState> {
  const { data, error } = await client.rpc('ai_status', { target_workspace: workspaceId });
  if (error) throw workError(error); return data as AIState;
}
export async function aiCommand<T = AIState>(client: Client, workspaceId: string, operation: string, payload: Record<string, Json>): Promise<T> {
  const { data, error } = await client.rpc('ai_command', { target_workspace: workspaceId, operation, payload });
  if (error) throw workError(error); return data as T;
}
export function assertAIEnabled(state: AIState) {
  if (!state.enabled) throw new HttpError(403, 'このワークスペースのAIは無効です。Owner・AdminがSettingsで有効化できます。');
  if (!state.personal_enabled) throw new HttpError(403, '外部送信の説明を確認し、自分のAI利用を有効にしてください。');
}
export async function aiContext(client: Client, workspaceId: string, ids: string[], intent = 'ids', filters: Record<string, Json> = {}): Promise<AIContext[]> {
  const { data, error } = await client.rpc('ai_context', { target_workspace: workspaceId, source_ids: ids, intent, query_filters: filters });
  if (error) throw workError(error); return data as AIContext[];
}
async function flow(client: Client, workspaceId: string, collection: string, filters: Record<string, Json>) {
  const { data, error } = await client.rpc('flow_query', { target_workspace: workspaceId, collection, filters });
  if (error) throw workError(error); return data as FlowBatch;
}
export async function retrieveAI(client: Client, workspaceId: string, question: string, ids: string[], feature: AIFeature, filters: Record<string, Json>) {
  const plan = searchPlan(question); let chosen: string[] = [...ids]; let note = '指定資料と直接つながる情報の抜粋です。';
  const applied: Record<string, Json> = { ...filters, ...(plan.from && !filters.from ? { from: plan.from, to: plan.to } : {}) };
  // Validate every supplied ID before searching anything. No invisible or foreign context may fall back to a broad search.
  if (chosen.length) await aiContext(client, workspaceId, chosen);
  else if (plan.intent !== 'search') {
    const direct = await aiContext(client, workspaceId, [], plan.intent, applied); chosen = direct.map(n => n.id);
    note = plan.intent === 'mine' ? '自分が担当する未完了のIssueから期限順に最大8件です。' : plan.intent === 'handoffs_mine' ? '自分宛ての引き継ぎから更新順に最大8件です。' : '担当者の変更履歴があるIssueから更新順に最大8件です。';
  } else if (plan.keywords.length) {
    const queries = [plan.keywords.join(' '), ...plan.keywords].filter((v, i, all) => all.indexOf(v) === i).slice(0, 3);
    const roots: string[] = []; const neighbors: string[] = [];
    for (const q of queries) {
      const batch = await flow(client, workspaceId, 'search', { ...applied, q });
      for (const id of batch.result_ids) if (!roots.includes(id)) roots.push(id);
      for (const node of batch.nodes) if (!neighbors.includes(node.id)) neighbors.push(node.id);
      if (roots.length >= 4) break;
    }
    chosen = [...new Set([...roots.slice(0, 4), ...neighbors])].slice(0, 8);
    note = `キーワード「${plan.keywords.join(' / ')}」による部分一致検索と関連資料です。最大8件・本文の抜粋のみを参照します。${applied.from ? '期間は日本時間の更新日で絞りました。開催日とは異なる場合があります。' : ''}`;
  } else note = '検索語を特定できませんでした。具体的な課題名・資料名か、表示中の情報を指定してください。';
  // Explicit source selections can expand by existing edges; Handoff never uses other Handoffs as draft sources.
  if (ids.length && chosen.length < 8) {
    for (const id of ids.slice(0, 2)) {
      const batch = await flow(client, workspaceId, 'neighbors', { id });
      chosen = [...new Set([...chosen, ...batch.nodes.filter(n => feature !== 'handoff' || n.kind !== 'handoff').map(n => n.id)])].slice(0, 8);
      if (chosen.length === 8) break;
    }
  }
  if (plan.intent !== 'search' && !ids.length && applied.from) note += ' 期間は日本時間の更新日で絞っています。開催日とは異なる場合があります。';
  const contexts = chosen.length ? await aiContext(client, workspaceId, chosen) : [];
  if (feature === 'handoff' && contexts.some(c => c.kind === 'handoff')) throw new HttpError(400, '下書きの資料はIssue・Project・Wikiから選んでください。');
  return { contexts, note };
}
