"use client";
import Link from 'next/link';
import { Button } from '@/components/ui/controls';
import { useAI } from '@/features/ai/components/AIProvider';
type Props = { initialPrompt?: string; onComplete?: (text: string) => void };
export default function GeminiAction({ initialPrompt = '' }: Props) {
  const ai = useAI();
  return <div className="ai-tool-card"><p>AI支援はワークスペースの資料を参照して利用できます。質問や提案は、外部送信に同意してから生成します。</p>{ai ? <Button type="button" onClick={() => ai.open({ question: initialPrompt })}>AIアシスタントを開く</Button> : <Link className="primary-button" href="/app">ワークスペースでAIを利用する →</Link>}</div>;
}
