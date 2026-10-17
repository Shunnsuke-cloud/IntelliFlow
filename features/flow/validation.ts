const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class FlowInputError extends Error {}
function fail(): never { throw new FlowInputError('検索条件・日付・関連先を確認してください。キーワードは200文字・8語以内です。'); }
export function flowId(value: unknown): string { if (typeof value !== 'string' || !idPattern.test(value)) fail(); return value; }
function date(value: string) { const parsed = new Date(value + 'T00:00:00Z'); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > '9998-12-31' || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) fail(); return value; }
export function flowFilters(params: URLSearchParams): Record<string, string | number | boolean> {
  const filters: Record<string, string | number | boolean> = {};
  const allowed = ['collection', 'q', 'kind', 'project', 'from', 'to', 'archived', 'offset', 'id'];
  for (const [key, value] of params) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) fail();
    if (key === 'collection') continue;
    if (key === 'q') { if (value.length > 200 || value.trim().split(/[\s　]+/).length > 8) fail(); filters.q = value.trim(); }
    else if (key === 'kind') { if (!['', 'issue', 'project', 'wiki', 'handoff'].includes(value)) fail(); filters.kind = value; }
    else if (['id', 'project'].includes(key)) { if (value) filters[key] = flowId(value); }
    else if (['from', 'to'].includes(key)) { if (value) filters[key] = date(value); }
    else if (key === 'archived') { if (!['true', 'false'].includes(value)) fail(); filters.archived = value === 'true'; }
    else { if (!/^\d{1,5}$/.test(value) || Number(value) > 10000) fail(); filters.offset = Number(value); }
  }
  if (filters.from && filters.to && filters.from > filters.to) fail();
  return filters;
}
export function relationInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const input = value as Record<string, unknown>;
  if (!['link', 'unlink'].includes(String(input.operation))) fail();
  const source_id = flowId(input.source_id), target_id = flowId(input.target_id);
  if (source_id === target_id || !Number.isSafeInteger(input.source_version) || Number(input.source_version) < 1 || !Number.isSafeInteger(input.target_version) || Number(input.target_version) < 1) fail();
  return { operation: String(input.operation), payload: { source_id, target_id, source_version: Number(input.source_version), target_version: Number(input.target_version) } };
}
