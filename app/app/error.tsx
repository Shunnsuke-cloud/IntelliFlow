"use client";
import { State, Button } from '@/components/ui/controls';
export default function ErrorPage({ reset }: { reset: () => void }) { return <State title="データを読み込めませんでした" error><p>接続とDB設定をご確認ください。入力済みのデータを削除する操作は行っていません。</p><Button onClick={reset}>再読み込み</Button><a href="/login">ログイン画面へ</a></State>; }
