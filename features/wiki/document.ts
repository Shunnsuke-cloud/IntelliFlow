export type WikiMark = { type: 'bold' | 'italic' | 'strike' | 'underline' | 'link'; attrs?: { href: string } };
export type WikiNode = { type: string; text?: string; attrs?: { level?: number; checked?: boolean; start?: number; attachmentId?: string; alt?: string }; marks?: WikiMark[]; content?: WikiNode[] };
export const emptyDocument: WikiNode = { type: 'doc', content: [{ type: 'paragraph' }] };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export class WikiInputError extends Error {}
function invalid(): never { throw new WikiInputError('本文の書式・文字数・リンクを確認してください。'); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
const blocks = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'image'];
export function validateDocument(value: unknown): WikiNode {
  let count = 0; let characters = 0;
  function node(value: unknown, parent: string, depth: number): WikiNode {
    if (++count > 4000 || depth > 20) invalid();
    const input = object(value); const type = String(input.type);
    if (Object.keys(input).some(key => !['type', 'text', 'attrs', 'marks', 'content'].includes(key))) invalid();
    const allowed = parent === '' ? ['doc'] : parent === 'doc' ? blocks : ['paragraph', 'heading'].includes(parent) ? ['text', 'hardBreak'] : ['bulletList', 'orderedList'].includes(parent) ? ['listItem'] : parent === 'taskList' ? ['taskItem'] : ['listItem', 'taskItem'].includes(parent) ? blocks : [];
    if (!allowed.includes(type)) invalid();
    const result: WikiNode = { type };
    const attrs = input.attrs === undefined ? {} : object(input.attrs);
    const attrKeys: Record<string, string[]> = { heading: ['level'], orderedList: ['start', 'type'], taskItem: ['checked'], image: ['attachmentId', 'alt'] };
    if (Object.keys(attrs).some(key => !(attrKeys[type] ?? []).includes(key))) invalid();
    if (type === 'heading') { if (![1, 2, 3].includes(Number(attrs.level))) invalid(); result.attrs = { level: Number(attrs.level) }; }
    if (type === 'orderedList') { const start = attrs.start ?? 1; if (!Number.isInteger(start) || Number(start) < 1 || Number(start) > 100000) invalid(); result.attrs = { start: Number(start) }; }
    if (type === 'taskItem') { if (typeof attrs.checked !== 'boolean') invalid(); result.attrs = { checked: attrs.checked }; }
    if (type === 'image') { if (typeof attrs.attachmentId !== 'string' || !uuidPattern.test(attrs.attachmentId) || (attrs.alt !== undefined && (typeof attrs.alt !== 'string' || attrs.alt.length > 300))) invalid(); result.attrs = { attachmentId: attrs.attachmentId, alt: String(attrs.alt ?? '') }; }
    if (type === 'text') {
      if (typeof input.text !== 'string' || !input.text.length) invalid();
      characters += input.text.length; if (characters > 60000) invalid(); result.text = input.text;
      if (input.marks !== undefined) {
        if (!Array.isArray(input.marks) || input.marks.length > 5) invalid();
        result.marks = input.marks.map(value => {
          const mark = object(value); const markType = mark.type;
          if (!['bold', 'italic', 'strike', 'underline', 'link'].includes(String(markType)) || Object.keys(mark).some(k => !['type', 'attrs'].includes(k))) invalid();
          if (markType === 'link') {
            const attributes = object(mark.attrs); if (Object.keys(attributes).some(k => !['href', 'target', 'rel', 'class'].includes(k))) invalid();
            const href = safeHref(attributes.href); if (!href) invalid(); return { type: 'link', attrs: { href } };
          }
          if (mark.attrs && Object.keys(object(mark.attrs)).length) invalid();
          return { type: markType as WikiMark['type'] };
        });
      }
    } else if (input.text !== undefined || input.marks !== undefined) invalid();
    if (input.content !== undefined) {
      if (!Array.isArray(input.content) || ['text', 'image', 'hardBreak'].includes(type)) invalid();
      result.content = input.content.map(child => node(child, type, depth + 1));
    }
    if (['doc', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem'].includes(type) && !result.content?.length) invalid();
    if (['listItem', 'taskItem'].includes(type) && result.content?.[0]?.type !== 'paragraph') invalid();
    return result;
  }
  const result = node(value, '', 0); if (JSON.stringify(result).length > 200000) invalid(); return result;
}
export function documentText(node: WikiNode): string { return node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(documentText).join(['paragraph', 'heading'].includes(node.type) ? '' : '\n'); }
export function imageIds(node: WikiNode): string[] { return [...new Set([...(node.type === 'image' && node.attrs?.attachmentId ? [node.attrs.attachmentId] : []), ...(node.content ?? []).flatMap(imageIds)])]; }
export function attachmentUrl(workspaceId: string, id: string) { return `/api/workspaces/${workspaceId}/wiki/attachments/${id}`; }
export function imageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
