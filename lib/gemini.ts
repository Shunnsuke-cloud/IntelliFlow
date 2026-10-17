import 'server-only';
import { DEFAULT_GEMINI_MODEL } from '@/features/ai/config';
export function geminiConfig() {
  const key = process.env.GEMINI_API_KEY ?? ''; const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  if (!/^[\x21-\x7e]{20,256}$/.test(key) || model !== DEFAULT_GEMINI_MODEL) throw new Error('AIのサーバー設定を確認してください。');
  return { key, model };
}
export { geminiRequest } from './gemini-core';
