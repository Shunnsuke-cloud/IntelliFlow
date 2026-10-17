import type { Json } from '@/lib/supabase/database';
export class InputError extends Error {}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(): never { throw new InputError('入力内容・文字数・日付を確認してください。'); }
export function uuid(value: unknown): string { if (typeof value !== 'string' || !uuidPattern.test(value)) fail(); return value; }
function text(value: unknown, limit: number, required = true): string {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) fail(); return value.trim();
}
function enumeration(value: unknown, choices: readonly string[]): string {
  if (typeof value !== 'string' || !choices.includes(value)) fail(); return value;
}
function date(value: unknown): string | null {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail();
  return value;
}
function version(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail(); return value; }
export function validateCommand(body: Record<string, unknown>) {
  const operation = enumeration(body.operation, ['issue_create', 'issue_update', 'project_create', 'project_update', 'archive', 'restore', 'comment_create', 'comment_update', 'comment_archive', 'link', 'unlink']);
  const payload: Record<string, Json> = {};
  if (!operation.endsWith('_create') || operation === 'comment_create') {
    payload.id = uuid(body.id); payload.expected_version = version(body.expected_version);
  }
  if (operation.startsWith('issue_') || operation.startsWith('project_')) {
    payload.title = text(body.title, 200); payload.description = text(body.description ?? '', 10000, false);
    payload.due_on = date(body.due_on);
    if (operation.startsWith('issue_')) {
      payload.status = enumeration(body.status, ['open', 'in_progress', 'review', 'done']);
      payload.priority = enumeration(body.priority, ['low', 'normal', 'high']);
      payload.project_id = body.project_id ? uuid(body.project_id) : null;
      payload.assignee_id = body.assignee_id ? uuid(body.assignee_id) : null;
      if (!Array.isArray(body.labels) || body.labels.length > 10) fail();
      payload.labels = [...new Set(body.labels.map(value => text(value, 30).toLowerCase()))];
    } else {
      payload.status = enumeration(body.status, ['planned', 'active', 'completed']); payload.start_on = date(body.start_on);
      if (payload.start_on && payload.due_on && payload.start_on > payload.due_on) fail();
      if (!Array.isArray(body.member_ids) || body.member_ids.length > 100) fail();
      payload.member_ids = [...new Set(body.member_ids.map(uuid))];
    }
  }
  if (operation === 'comment_create' || operation === 'comment_update') payload.body = text(body.body, 5000);
  if (operation === 'comment_update' || operation === 'comment_archive') { payload.comment_id = uuid(body.comment_id); payload.comment_version = version(body.comment_version); }
  if (operation === 'link' || operation === 'unlink') payload.other_id = uuid(body.other_id);
  return { operation, payload };
}
export function validateFilters(params: URLSearchParams): Record<string, Json> {
  const result: Record<string, Json> = {};
  for (const key of ['q', 'status', 'priority', 'assignee', 'project', 'label', 'due_before', 'member', 'sort', 'archived', 'offset', 'limit']) {
    const value = params.get(key); if (value === null || value === '') continue;
    if (key === 'q') result[key] = text(value, 200, false);
    else if (key === 'status') result[key] = enumeration(value, ['open', 'in_progress', 'review', 'done', 'blocked', 'planned', 'active', 'completed']);
    else if (key === 'priority') result[key] = enumeration(value, ['low', 'normal', 'high']);
    else if (['assignee', 'project', 'member'].includes(key)) result[key] = value === 'none' && key !== 'member' ? value : uuid(value);
    else if (key === 'label') result[key] = text(value, 30).toLowerCase();
    else if (key === 'due_before') result[key] = date(value);
    else if (key === 'sort') result[key] = enumeration(value, ['updated', 'created', 'title', 'due', 'priority', 'number']);
    else if (key === 'archived') result[key] = enumeration(value, ['true', 'false']) === 'true';
    else {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || (key === 'limit' && (Number(value) < 1 || Number(value) > 100))) fail();
      result[key] = Number(value);
    }
  }
  return result;
}
