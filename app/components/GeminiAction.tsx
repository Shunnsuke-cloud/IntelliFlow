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
    <div className="ai-tool-card">
      <label className="auth-label">Prompt</label>
      <textarea
        className="ai-tool-input"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={7}
      />

      <div className="auth-actions">
        <button className="primary-button" onClick={run} disabled={loading || !prompt.trim()}>
          {loading ? '生成中…' : '生成'}
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            setPrompt('');
            setResult(null);
            setError(null);
          }}
        >
          クリア
        </button>
      </div>

      {error && <div className="ai-tool-error">{error}</div>}

      {result && (
        <div className="ai-tool-result">
          <label className="auth-label">Result</label>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
}
