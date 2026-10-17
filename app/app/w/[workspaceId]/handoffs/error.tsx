"use client";
import { Button, State } from '@/components/ui/controls';
export default function ErrorPage({ reset }: { reset: () => void }) { return <State title="引き継ぎを読み込めませんでした" error><p>接続とHandoff用のDB設定を確認してください。</p><Button onClick={reset}>再試行</Button></State>; }
