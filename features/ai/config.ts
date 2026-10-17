// Model default is centralized here; no key is imported into client code.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const aiLimits = {
  input: 1200, sourceCount: 8, sourceExcerpt: 1200, contextCharacters: 12000,
  timeoutMs: 25000, requestBytes: 12000,
  outputTokens: { chat: 1536, flow: 2560, handoff: 4096 },
  thinking: { chat: 'LOW', flow: 'MEDIUM', handoff: 'MEDIUM' },
} as const;
