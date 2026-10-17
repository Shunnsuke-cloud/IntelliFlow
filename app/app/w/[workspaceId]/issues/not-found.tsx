import Link from 'next/link';
export default function NotFound() { return <section className="if-state"><h1>Issue（課題）が見つかりません</h1><p>存在しない課題か、アクセス権がない課題です。</p><Link href="/app">ワークスペース一覧へ</Link></section>; }
