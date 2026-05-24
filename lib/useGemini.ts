import supabase from './supabaseClient';

export type GeminiResponse = {
  text: string;
};

export default async function generateFromGemini(prompt: string): Promise<GeminiResponse> {
  let token: string | null = null;
  try {
    if (supabase) {
      const sess = await supabase.auth.getSession();
      token = sess.data.session?.access_token ?? null;
    }
  } catch (e) {
    // ignore
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API request failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json as GeminiResponse;
}
