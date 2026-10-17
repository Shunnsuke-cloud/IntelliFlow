"use client";
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="page-shell"><h1>読み込みに失敗しました</h1><p role="alert">認証・DBの設定や接続をご確認ください。DBマイグレーションが未適用の場合、管理者による設定が必要です。</p><button className="primary-button" onClick={reset}>再読み込み</button><Link href="/login">ログイン画面へ</Link></main>;
}
