export type GeminiResponse = {
  text: string;
};

export default async function generateFromGemini(prompt: string): Promise<GeminiResponse> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API request failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json as GeminiResponse;
}
