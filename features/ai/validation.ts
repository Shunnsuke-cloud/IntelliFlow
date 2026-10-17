import type { AIDraft, AIFeature } from './types';
export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('入力形式を確認してください。');
  return value as Record<string, unknown>;
}
export function aiFeature(value: unknown): AIFeature {
  if (value !== 'chat' && value !== 'flow' && value !== 'handoff') throw new Error('AIの操作を確認してください。'); return value;
}
export function sourceIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8 || value.some(v => typeof v !== 'string' || !idPattern.test(v))) throw new Error('関連資料は8件以内で指定してください。');
  return [...new Set(value as string[])];
}
function bounded(value: unknown, max: number) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('AIの出力形式を確認できませんでした。'); return value.trim(); }
export const draftFields = ['summary', 'current_state', 'completed_work', 'pending_work', 'risks', 'next_actions'] as const;
export const answerSchema = {
  type: 'object', additionalProperties: false, required: ['answer', 'source_ids', 'unknown'],
  properties: { answer: { type: 'string', maxLength: 6000 }, source_ids: { type: 'array', maxItems: 8, items: { type: 'string' } }, unknown: { type: 'boolean' } },
};
export const draftSchema = { ...answerSchema, required: [...answerSchema.required, 'draft'], properties: { ...answerSchema.properties,
  draft: { type: 'object', additionalProperties: false, required: [...draftFields, 'review_questions'], properties: {
    ...Object.fromEntries(draftFields.map(key => [key, { type: 'string', maxLength: 2400 }])),
    review_questions: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 300 } },
  } },
} };
export function validateAnswer(value: unknown, allowed: string[], feature: AIFeature) {
  const v = object(value); const ids = sourceIds(v.source_ids);
  if (typeof v.unknown !== 'boolean' || ids.some(id => !allowed.includes(id)) || (!v.unknown && !ids.length)) throw new Error('根拠となる資料を確認できませんでした。');
  const answer = bounded(v.answer, 6000);
  if (/https?:\/\/|javascript:|\]\(|\/app\/w\//i.test(answer)) throw new Error('AIが返したリンクを確認できませんでした。');
  let draft: AIDraft | undefined;
  if (feature === 'handoff') {
    const d = object(v.draft); const entries = draftFields.map(key => [key, bounded(d[key], 2400)] as const);
    if (!Array.isArray(d.review_questions) || d.review_questions.length > 8) throw new Error('確認事項を読み取れませんでした。');
    draft = { ...Object.fromEntries(entries), review_questions: d.review_questions.map(q => bounded(q, 300)) } as AIDraft;
  }
  return { answer, source_ids: ids, unknown: v.unknown, ...(draft ? { draft } : {}) };
}
export function redactSecrets(text: string, secrets: string[] = []) {
  let safe = text;
  for (const secret of secrets) if (secret.length >= 8) safe = safe.split(secret).join('[秘密情報を除外]');
  return safe.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[秘密鍵を除外]')
    .replace(/\bAIza[\w-]{20,}\b|\b(?:sk|sb_secret|ghp|github_pat)[_-][\w-]{16,}|\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[秘密情報を除外]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [除外]')
    .replace(/((?:api[_ -]?key|access[_ -]?token|password|secret|パスワード)\s*[=:：]\s*)[^\s,;]+/gi, '$1[除外]');
}
export function redactJson(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') return redactSecrets(value, secrets);
  if (Array.isArray(value)) return value.map(item => redactJson(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactJson(item, secrets)]));
  return value;
}
export function verifyMentions(value: unknown, sources: { id: string; issue_number: number | null }[]) {
  const text = JSON.stringify(value);
  const ids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
  if (ids.some(id => !sources.some(s => s.id.toLowerCase() === id.toLowerCase()))) throw new Error('未知の資料IDです。');
  for (const match of text.matchAll(/\bISSUE-(\d+)\b/gi)) if (!sources.some(s => s.issue_number === Number(match[1]))) throw new Error('未知の課題番号です。');
}
// Deterministic keyword/intent extraction, without a paid search-planning call.
export function searchPlan(question: string, now = new Date()) {
  const mine = /自分|わたし|私の|自分宛/.test(question);
  const assignments = /担当者.*変更|担当.*変わ|担当.*変更/.test(question);
  const phrases = question.normalize('NFKC').replace(/(?:昨年|去年|今年|以前|過去|今|自分が|自分の|私の|わたしの|対応すべき|発生した|問題になった|関連する|関連した|この|その|どの|について|教えて|ください|ですか|だった|はあった|あった|こと|内容|確認すべき事項|何|なに|[?？。、「」])/g, ' ');
  const keywords = phrases.split(/[\s　]+|(?:での|から|には|の|で|は|が|を|と|に|する|した|して)/).map(w => w.trim()).filter(w => w.length >= 2 && !/^(?:Issue|Project|Wiki|Handoff|課題|進捗|引き継ぎ|担当者|対応|残した|前任者|現在)$/i.test(w));
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Tokyo' }).format(now));
  const year = /昨年|去年/.test(question) ? currentYear - 1 : /今年/.test(question) ? currentYear : null;
  return { intent: assignments ? 'assignments' : mine && /引き継|Handoff/i.test(question) ? 'handoffs_mine' : mine ? 'mine' : 'search',
    keywords: [...new Set(keywords)].slice(0, 3), from: year ? `${year}-01-01` : '', to: year ? `${year}-12-31` : '' };
}
