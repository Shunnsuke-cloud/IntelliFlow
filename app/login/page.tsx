import SupabaseAuth from '../components/SupabaseAuth';
import Link from 'next/link';
import { safeNext } from '@/lib/auth/policy';
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return <main className="page-shell"><Link href="/">IntelliFlow</Link><h1>ログイン</h1><p>情報をつなぎ、次の人へ。</p>{params.error && <p role="alert">認証できませんでした。設定・リンクの有効期限を確認し、もう一度ログインしてください。</p>}<SupabaseAuth onSignedInRedirectTo={safeNext(params.next)} /></main>;
}
