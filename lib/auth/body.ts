export class BodyError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
// Bound the stream before buffering it; checking req.text().length afterwards is too late.
export async function readJsonBody(req: Request, maxCharacters = 24000, maxBytes = 96000): Promise<Record<string, unknown>> {
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await req.body?.cancel(); throw new BodyError(413, '入力が長すぎます。');
  }
  const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new BodyError(413, '入力が長すぎます。'); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new BodyError(400, '入力形式を確認してください。'); }
  if (text.length > maxCharacters) throw new BodyError(413, '入力が長すぎます。');
  try { const value: unknown = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
  catch { throw new BodyError(400, '入力形式を確認してください。'); }
}
