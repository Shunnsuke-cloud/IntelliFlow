import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { readBody, textField, HttpError, apiError } from '@/lib/auth/server';
import { wikiContext, limitedRequest } from '@/lib/wiki';
import { geminiConfig, geminiRequest } from '@/lib/gemini';
import { GeminiError } from '@/lib/gemini-core';
import { aiCommand, aiContext, aiStatus, assertAIEnabled, retrieveAI, type AIState } from '@/lib/ai';
import { aiFeature, idPattern, redactSecrets, redactJson, sourceIds, validateAnswer, verifyMentions } from '@/features/ai/validation';
import { aiLimits } from '@/features/ai/config';
import type { Json } from '@/lib/supabase/database';
export const runtime = 'nodejs';
export const maxDuration = 40;
const json = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(req: Request) {
  try {
    const workspaceId = new URL(req.url).searchParams.get('workspace_id') ?? '';
    const { client } = await wikiContext(req, workspaceId);
    return json({ status: await aiStatus(client, workspaceId) });
  } catch (error) { return apiError(error); }
}
export async function POST(req: Request) {
  let finish: ((payload: Record<string, Json>) => Promise<AIState>) | undefined;
  let tokens: { input_tokens: number | null; output_tokens: number | null; thinking_tokens: number | null } = { input_tokens: null, output_tokens: null, thinking_tokens: null };
  try {
    const body = await readBody(await limitedRequest(req, aiLimits.requestBytes));
    const workspaceId = textField(body.workspace_id, 36);
    const { client, role } = await wikiContext(req, workspaceId);
    if (body.operation === 'settings' || body.operation === 'preference') {
      if (typeof body.enabled !== 'boolean') throw new HttpError(400, '有効・無効を指定してください。');
      if (body.operation === 'settings' && !['owner', 'admin'].includes(role)) throw new HttpError(403, '設定の変更はOwner・Adminが行えます。');
      const payload: Record<string, Json> = { enabled: body.enabled, consent: body.consent === true };
      if (body.operation === 'settings') {
        if (!Number.isInteger(body.user_limit) || Number(body.user_limit) < 1 || Number(body.user_limit) > 100 || !Number.isInteger(body.workspace_limit) || Number(body.workspace_limit) < 1 || Number(body.workspace_limit) > 500) throw new HttpError(400, '利用上限の範囲を確認してください。');
        payload.user_limit = Number(body.user_limit); payload.workspace_limit = Number(body.workspace_limit);
      }
      return json({ status: await aiCommand(client, workspaceId, body.operation, payload) });
    }
    if (body.operation !== 'generate') throw new HttpError(400, 'ワークスペース内のAIアシスタントから操作してください。');
    let feature; let ids;
    try { feature = aiFeature(body.feature); ids = sourceIds(body.source_ids ?? []); } catch { throw new HttpError(400, 'AI機能と資料の指定を確認してください（最大8件）。'); }
    if (feature === 'handoff' && (role === 'viewer' || !ids.length)) throw new HttpError(403, '下書きの生成には編集権限と対象資料が必要です。');
    const question = textField(body.question, aiLimits.input);
    if (body.consent !== true) throw new HttpError(400, '外部送信の同意が必要です。');
    const requestId = textField(body.request_id, 36); if (!idPattern.test(requestId)) throw new HttpError(400, '送信IDを確認してください。');
    const before = await aiStatus(client, workspaceId); assertAIEnabled(before);
    const config = geminiConfig();
    const secrets = Object.entries(process.env).filter(([name]) => /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/.test(name)).map(([, value]) => value ?? '');
    const safeQuestion = redactSecrets(question, secrets);
    const filters: Record<string, Json> = {};
    if (body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)) {
      const f = body.filters as Record<string, unknown>;
      if (f.kind) { if (!['issue', 'project', 'wiki', 'handoff'].includes(String(f.kind))) throw new HttpError(400, '種類を確認してください。'); filters.kind = String(f.kind); }
      if (f.project) { if (!idPattern.test(String(f.project))) throw new HttpError(400, 'Projectを確認してください。'); filters.project = String(f.project); }
      for (const key of ['from', 'to']) if (f[key]) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f[key]))) throw new HttpError(400, '日付を確認してください。'); filters[key] = String(f[key]); }
    }
    const { contexts, note } = await retrieveAI(client, workspaceId, safeQuestion, ids, feature, filters);
    if (!contexts.length) return json({ answer: '参照できる情報が見つかりませんでした。検索語を短くするか、対象のIssue・Project・Wiki・Handoffを開いて質問してください。', source_ids: [], unknown: true, sources: [], status: before, search_note: note });
    // Redact actual server credentials as well as recognizable secret patterns. Never put env values in output/logs.
    const redacted = contexts.map(c => ({ ...c, title: redactSecrets(c.title, secrets), excerpt: redactSecrets(c.excerpt, secrets), details: redactJson(c.details, secrets) as Json }));
    const metadataSize = redacted.reduce((sum, c) => sum + JSON.stringify({ ...c, excerpt: '' }).length, 0);
    if (metadataSize > aiLimits.contextCharacters - 800) throw new HttpError(413, '参照情報が多すぎます。資料の数を減らしてください。');
    const excerptBudget = Math.floor((aiLimits.contextCharacters - metadataSize) / redacted.length);
    const sources = redacted.map(c => {
      let excerpt = c.excerpt;
      const excess = JSON.stringify(excerpt).length - 2 - excerptBudget;
      if (excess > 0) excerpt = excerpt.slice(0, Math.max(0, excerpt.length - excess));
      return { ...c, excerpt };
    });
    const runId = randomUUID(); // Opaque server-only audit ID, separate from the client idempotency key.
    const reservation = await aiCommand<{ allowed: boolean; reason?: string }>(client, workspaceId, 'reserve', { run_id: runId, request_id: requestId, feature, model: config.model, consent: true });
    if (!reservation.allowed) return NextResponse.json({ error: reservation.reason === 'limit' ? '本日のAI利用上限に達しました。通常の検索・手動操作を利用できます。' : '送信済み、または処理中です。時間をおいてください。' }, { status: 429, headers: { 'Retry-After': reservation.reason === 'limit' ? String(Math.max(1, Math.ceil((Date.parse(before.resets_at) - Date.now()) / 1000))) : '60', 'Cache-Control': 'no-store' } });
    finish = payload => aiCommand(client, workspaceId, 'finish', { run_id: runId, ...payload });
    const safeNote = redactSecrets(note, secrets);
    const generated = await geminiRequest(config, feature, { question: safeQuestion, feature, scope: safeNote, sources });
    tokens = { input_tokens: generated.input_tokens, output_tokens: generated.output_tokens, thinking_tokens: generated.thinking_tokens };
    let answer;
    try { answer = validateAnswer(generated.value, sources.map(c => c.id), feature); verifyMentions(answer, sources); } catch { throw new GeminiError('invalid_output'); }
    // Authorization, opt-in, and source revision are checked again after the external call.
    const after = await aiStatus(client, workspaceId); assertAIEnabled(after);
    if (before.settings_revision !== after.settings_revision || before.preference_revision !== after.preference_revision) throw new HttpError(409, 'AI設定が変更されたため回答を破棄しました。');
    const current = await aiContext(client, workspaceId, sources.map(c => c.id));
    if (current.length !== sources.length || current.some(c => !contexts.some(s => s.id === c.id && JSON.stringify(s) === JSON.stringify(c)))) throw new HttpError(409, '資料や関連情報が更新されたため回答を破棄しました。再度確認してください。');
    // Output can echo source secrets: apply redaction to every generated string, too.
    const safeAnswer = redactJson(answer, secrets) as typeof answer;
    const status = await finish({ status: 'succeeded', ...tokens }); finish = undefined;
    return json({ ...safeAnswer, sources: sources.filter(c => answer.source_ids.includes(c.id)), status, search_note: safeNote });
  } catch (error) {
    if (finish) { try { await finish({ status: 'failed', error_code: error instanceof GeminiError ? error.code : error instanceof HttpError && [403, 404, 409].includes(error.status) ? 'access_changed' : 'internal', ...tokens }); } catch { /* Fail closed; a reserved attempt still counts and remains auditable. No body/error details are logged. */ } }
    if (error instanceof GeminiError) return NextResponse.json({ error: error.code === 'rate_limit' ? 'Google側の利用上限に達しました。時間をおいてください。' : error.code === 'timeout' ? 'AIの応答がタイムアウトしました。通常機能は引き続き使えます。' : 'AIの回答を確認できませんでした。自動再試行は行いません。' }, { status: error.status, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
    return apiError(error);
  }
}
