export async function generateText(prompt: string, opts?: { temperature?: number; maxOutputTokens?: number }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment");

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
