"use client";

import React, { useState } from 'react';
import generateFromGemini from '../../lib/useGemini';

type Props = {
  initialPrompt?: string;
  onComplete?: (text: string) => void;
};

export default function GeminiAction({ initialPrompt = '', onComplete }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { text } = await generateFromGemini(prompt);
      setResult(text);
      if (onComplete) onComplete(text);
    } catch (e: any) {
      setError(e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: '1px solid #e6e6e6', padding: 12, borderRadius: 8 }}>
      <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Prompt</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        style={{ width: '100%', marginBottom: 8 }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={run} disabled={loading || !prompt.trim()}>
          {loading ? '生成中…' : '生成'}
        </button>
        <button
          onClick={() => {
            setPrompt('');
            setResult(null);
            setError(null);
          }}
        >
          クリア
        </button>
      </div>

      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12 }}>Result</label>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 8 }}>{result}</pre>
        </div>
      )}
    </div>
  );
}
