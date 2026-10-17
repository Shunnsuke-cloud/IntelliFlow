import Link from 'next/link';
export default function NotFound() { return <section className="if-state"><h1>ページまたは過去の版が見つかりません</h1><p>存在しないか、閲覧する権限がありません。</p><Link href="/app">ワークスペース一覧へ</Link></section>; }
