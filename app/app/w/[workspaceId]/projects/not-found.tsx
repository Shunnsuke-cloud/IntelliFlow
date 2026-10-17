import Link from 'next/link';
export default function NotFound() { return <section className="if-state"><h1>プロジェクトが見つかりません</h1><p>存在しないプロジェクトか、アクセス権がないプロジェクトです。</p><Link href="/app">ワークスペース一覧へ</Link></section>; }
