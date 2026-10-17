"use client";
import { Button, State } from '@/components/ui/controls';
export default function ErrorPage({ reset }: { reset: () => void }) { return <State title="Flow Mapを読み込めませんでした" error><p>接続状態とFlow Map用のDB設定を確認してください。</p><Button onClick={reset}>再試行</Button></State>; }
