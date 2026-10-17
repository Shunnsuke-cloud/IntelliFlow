export class HandoffInputError extends Error {}
const fields = ['summary', 'current_state', 'completed_work', 'pending_work', 'risks', 'next_actions'] as const;
function invalid(message = '入力内容・受取人・関連情報を確認してください。'): never { throw new HandoffInputError(message); }
export function handoffId(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid(); return value; }
export function handoffInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>; const operation = String(input.operation);
  if (!['create', 'update', 'send', 'revise', 'accept', 'complete'].includes(operation)) invalid();
  const payload: Record<string, string | number | string[] | null> = {};
  if (operation !== 'create') { payload.id = handoffId(input.id); if (!Number.isSafeInteger(input.expected_version) || Number(input.expected_version) < 1) invalid(); payload.expected_version = Number(input.expected_version); }
  if (['accept', 'complete'].includes(operation)) { if (!Number.isSafeInteger(input.content_version) || Number(input.content_version) < 1) invalid(); payload.content_version = Number(input.content_version); }
  if (['create', 'update', 'revise'].includes(operation)) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) invalid('タイトルは1〜200文字にしてください。'); payload.title = input.title.trim();
    for (const field of fields) { if (typeof input[field] !== 'string' || input[field].length > 10000) invalid('各本文は10,000文字以内にしてください。'); payload[field] = input[field]; }
    payload.recipient_id = input.recipient_id ? handoffId(input.recipient_id) : null;
    if (!Array.isArray(input.related_ids) || input.related_ids.length > 30) invalid('関連情報は30件まで指定できます。'); payload.related_ids = [...new Set(input.related_ids.map(handoffId))];
  }
  if (operation === 'revise') { if (typeof input.change_reason !== 'string' || !input.change_reason.trim() || input.change_reason.trim().length > 1000) invalid('変更理由を1〜1,000文字で入力してください。'); payload.change_reason = input.change_reason.trim(); }
  return { operation, payload };
}
export function handoffFilters(params: URLSearchParams): Record<string, string | number | boolean> {
  const filters: Record<string, string | number | boolean> = {};
  for (const [key, value] of params) {
    if (!['collection', 'q', 'status', 'sender', 'recipient', 'mine', 'offset', 'id', 'source_id', 'version'].includes(key) || params.getAll(key).length > 1) invalid();
    if (key === 'collection') continue;
    if (key === 'q') { if (value.length > 200) invalid(); filters.q = value.trim(); }
    else if (key === 'status') { if (!['', 'draft', 'sent', 'accepted', 'completed', 'cancelled'].includes(value)) invalid(); filters.status = value; }
    else if (key === 'mine') { if (!['true', 'false'].includes(value)) invalid(); filters.mine = value === 'true'; }
    else if (key === 'offset') { if (!/^\d{1,5}$/.test(value) || Number(value) > 10000) invalid(); filters.offset = Number(value); }
    else if (key === 'version') { if (!/^[1-9]\d{0,7}$/.test(value)) invalid(); filters.version = Number(value); }
    else if (value) filters[key] = handoffId(value);
  }
  return filters;
}
