import type { FlowNode } from '../flow/types';
export type AIFeature = 'chat' | 'flow' | 'handoff';
export type AIStatus = { enabled: boolean; personal_enabled: boolean; can_manage: boolean; user_limit: number; workspace_limit: number; user_remaining: number; workspace_remaining: number; resets_at: string };
export type AIDraft = { summary: string; current_state: string; completed_work: string; pending_work: string; risks: string; next_actions: string; review_questions: string[] };
export type AIResult = { answer: string; source_ids: string[]; unknown: boolean; draft?: AIDraft; sources: FlowNode[]; status: AIStatus; search_note: string };
