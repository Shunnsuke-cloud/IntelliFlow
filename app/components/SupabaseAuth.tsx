"use client";
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import supabase from '@/lib/supabaseClient';
import { safeNext } from '@/lib/auth/policy';
type Props = { onSignedInRedirectTo?: string; onSignedOutRedirectTo?: string };
export default function SupabaseAuth({ onSignedInRedirectTo = '/app', onSignedOutRedirectTo = '/' }: Props) {
  const [view, setView] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [user, setUser] = useState<User | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch { setError('認証に失敗しました。入力内容・接続を確認して、もう一度お試しください。'); } finally { setBusy(false); }
  }
  function callback() {
    const url = new URL('/auth/callback', window.location.origin);
    url.searchParams.set('next', safeNext(onSignedInRedirectTo)); return url.toString();
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); await run(async () => {
      if (!supabase) throw new Error();
      if (view === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(), shouldCreateUser: false } });
        if (error) throw error; setMessage('登録済みの場合、ログイン用リンクを送信しました。メールをご確認ください。');
      } else if (view === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(), data: { full_name: name.trim() } } });
        if (error) throw error;
        if (data.session) window.location.assign(safeNext(onSignedInRedirectTo)); else setMessage('確認メールのリンクを開くと登録が完了します。');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) throw error; window.location.assign(safeNext(onSignedInRedirectTo));
      }
    });
  }
  if (!supabase) return <p role="alert">認証の環境設定が必要です。管理者にお問い合わせください。</p>;
  return <div className="auth-card">
    {error && <p role="alert" className="if-error">{error}</p>}{message && <p role="status">{message}</p>}
    {user ? <><p>{user.email}</p><a className="primary-button" href={safeNext(onSignedInRedirectTo)}>ワークスペースへ</a><button className="secondary-button" disabled={busy} onClick={() => run(async () => { const { error } = await supabase!.auth.signOut(); if (error) throw error; window.location.assign(safeNext(onSignedOutRedirectTo)); })}>ログアウト</button></> : <>
      <div className="auth-switcher">{([['signin', 'ログイン'], ['signup', '新規登録'], ['magic', 'メールリンク']] as const).map(([key, label]) => <button key={key} type="button" disabled={busy} aria-pressed={view === key} onClick={() => { setView(key); setError(''); setMessage(''); }}>{label}</button>)}</div>
      <form onSubmit={submit} className="auth-form">
        {view === 'signup' && <><label className="auth-label" htmlFor="auth-name">表示名</label><input id="auth-name" className="auth-input" autoComplete="name" maxLength={80} required value={name} onChange={e => setName(e.target.value)} /></>}
        <label className="auth-label" htmlFor="auth-email">メールアドレス</label><input id="auth-email" className="auth-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        {view !== 'magic' && <><label className="auth-label" htmlFor="auth-password">パスワード</label><input id="auth-password" className="auth-input" type="password" autoComplete={view === 'signup' ? 'new-password' : 'current-password'} minLength={view === 'signup' ? 8 : undefined} required value={password} onChange={e => setPassword(e.target.value)} /></>}
        <button className="primary-button" disabled={busy}>{busy ? '処理中…' : view === 'signup' ? '登録する' : view === 'magic' ? 'リンクを送信' : 'ログイン'}</button>
      </form>
      <button className="secondary-button" disabled={busy} onClick={() => run(async () => { const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback() } }); if (error) throw error; })}>Googleでログイン</button>
    </>}
  </div>;
}
