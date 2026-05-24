export async function generateText(prompt: string, opts?: { temperature?: number; maxOutputTokens?: number }) {
  const key = process.env.GEMINI_API_KEY;
  // Local development fallback: if no key is set, return a mock response so the UI can be tested
  if (!key) {
    return `（モック応答）プロンプト: ${prompt}\n\n1) タスクA — 期限: 3日以内\n2) タスクB — 期限: 1週間以内\n3) タスクC — 期限: 今月末`; 
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/text-bison-001:generateText?key=${encodeURIComponent(
    key
  )}`;

  const body = {
    prompt: { text: prompt },
    temperature: opts?.temperature ?? 0.2,
    candidateCount: 1,
    maxOutputTokens: opts?.maxOutputTokens ?? 256,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Expect data.candidates[0].output or similar shape
  const candidate = data?.candidates?.[0]?.output ?? data?.candidates?.[0]?.content ?? null;
  if (!candidate) {
    // fallback to raw response
    return data;
  }

  return candidate;
}
