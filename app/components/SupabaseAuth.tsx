"use client";
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import supabase from '@/lib/supabaseClient';
import { safeNext } from '@/lib/auth/policy';
import { Arrow } from './marketing/Brand';

type Props = { onSignedInRedirectTo?: string; onSignedOutRedirectTo?: string; initialView?: 'signin' | 'signup'; callbackError?: boolean };
export default function SupabaseAuth({ onSignedInRedirectTo = '/app', onSignedOutRedirectTo = '/', initialView = 'signin', callbackError = false }: Props) {
  const [view, setView] = useState<'signin' | 'signup' | 'magic'>(initialView);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [visible, setVisible] = useState(false);
  const [name, setName] = useState(''); const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(callbackError ? '認証できませんでした。リンクの有効期限や設定を確認して、もう一度ログインしてください。' : '');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch { setError('認証に失敗しました。メールアドレス・パスワードや接続を確認して、もう一度お試しください。'); }
    finally { lock.current = false; setBusy(false); }
  }
  function callback() { const url = new URL('/auth/callback', window.location.origin); url.searchParams.set('next', safeNext(onSignedInRedirectTo)); return url.toString(); }
  function switchView(next: 'signin' | 'magic') { setView(next); setError(''); setMessage(''); }
  async function submit(e: FormEvent) {
    e.preventDefault(); await run(async () => {
      if (!supabase) throw new Error();
      if (view === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(), shouldCreateUser: false } });
        if (error) throw error; setMessage('登録済みの場合、ログイン用リンクを送信しました。メールをご確認ください。');
      } else if (view === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(), data: { full_name: name.trim() } } });
        if (error) throw error;
        if (data.session) window.location.assign(safeNext(onSignedInRedirectTo)); else setMessage('確認メールのリンクを開くと登録が完了します。メールをご確認ください。');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) throw error; window.location.assign(safeNext(onSignedInRedirectTo));
      }
    });
  }
  const nextQuery = onSignedInRedirectTo === '/app' ? '' : `?next=${encodeURIComponent(safeNext(onSignedInRedirectTo))}`;
  return <div className="a-form-wrap">
    <span className="m-eyebrow">{view === 'signup' ? 'START YOUR FLOW' : view === 'magic' ? 'BACK TO YOUR WORKSPACE' : 'WELCOME BACK'}</span>
    <h1>{user ? '続きから、始めよう。' : view === 'signup' ? '新しい流れを、ここから。' : view === 'magic' ? 'メールでログイン' : 'おかえりなさい。'}</h1>
    <p className="a-form-intro">{user ? 'ログイン済みのワークスペースに移動できます。' : view === 'signup' ? '無料で登録して、情報をつなぐ一歩を。' : view === 'magic' ? 'パスワードを使わず、メールのリンクからログインできます。' : 'ログインして、チームの知識とつながろう。'}</p>
    {!supabase && <p role="alert" className="a-alert">認証の環境設定が必要です。管理者にお問い合わせください。</p>}
    {error && <p role="alert" className="a-alert">{error}</p>}{message && <p role="status" className="a-notice">{message}</p>}
    {supabase && (user ? <div className="a-signed-in"><p>{user.email}</p><Link className="m-button" href={safeNext(onSignedInRedirectTo)}>ワークスペースへ <Arrow /></Link><button className="a-link-button" disabled={busy} onClick={() => run(async () => { const { error } = await supabase!.auth.signOut(); if (error) throw error; window.location.assign(safeNext(onSignedOutRedirectTo)); })}>ログアウト</button></div> : <>
      {view !== 'magic' && <><button type="button" className="a-google" disabled={busy} onClick={() => run(async () => { const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback() } }); if (error) throw error; })}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.5h3.22c1.88-1.74 2.99-4.3 2.99-7.35Z"/><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.61-2.42l-3.22-2.5c-.9.6-2.04.97-3.39.97-2.6 0-4.8-1.76-5.59-4.12H3.09v2.58A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.41 13.93A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.93V7.49H3.09A10 10 0 0 0 2 12c0 1.61.38 3.14 1.09 4.51Z"/><path fill="#ea4335" d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.91 5.49l3.32 2.58C7.2 7.71 9.4 5.95 12 5.95Z"/></svg>Googleで{view === 'signup' ? '登録' : 'ログイン'}</button><div className="a-divider"><span/>またはメールアドレスで<span/></div></>}
      <form onSubmit={submit} className="auth-form a-form" aria-busy={busy}>
        {view === 'signup' && <div className="a-field"><label htmlFor="auth-name">表示名</label><input id="auth-name" autoComplete="name" maxLength={80} required value={name} placeholder="山田 太郎" disabled={busy} onChange={e => setName(e.target.value)} /></div>}
        <div className="a-field"><label htmlFor="auth-email">メールアドレス</label><input id="auth-email" type="email" autoComplete="email" required value={email} placeholder="you@example.com" disabled={busy} onChange={e => setEmail(e.target.value)} /></div>
        {view !== 'magic' && <div className="a-field"><label htmlFor="auth-password">パスワード</label><div className="a-password"><input id="auth-password" type={visible ? 'text' : 'password'} autoComplete={view === 'signup' ? 'new-password' : 'current-password'} minLength={view === 'signup' ? 8 : undefined} aria-describedby={view === 'signup' ? 'password-help' : undefined} required value={password} placeholder={view === 'signup' ? '8文字以上のパスワード' : 'パスワードを入力'} disabled={busy} onChange={e => setPassword(e.target.value)} /><button type="button" aria-label={visible ? 'パスワードを非表示' : 'パスワードを表示'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(!visible)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5"/>{visible && <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.5"/>}</svg></button></div>{view === 'signup' && <small id="password-help">8文字以上で設定してください。</small>}</div>}
        {view === 'signin' && <button type="button" className="a-forgot a-link-button" disabled={busy} onClick={() => switchView('magic')}>パスワードを忘れた方</button>}
        <button className="m-button a-submit" disabled={busy}>{busy ? <><span className="a-spinner"/> 処理中…</> : <>{view === 'signup' ? '登録する' : view === 'magic' ? 'リンクを送信' : 'ログイン'} <Arrow /></>}</button>
      </form>
      <p className="a-switch">{view === 'signup' ? <>アカウントをお持ちの方は <Link href={`/login${nextQuery}`}>ログイン</Link></> : view === 'magic' ? <button type="button" className="a-link-button" disabled={busy} onClick={() => switchView('signin')}>← パスワードでログイン</button> : <>初めての方は <Link href={`/signup${nextQuery}`}>無料で新規登録 <span>↗</span></Link></>}</p>
    </>)}
    <div className="a-form-footer"><span aria-hidden="true">◇</span> あなたの情報は、ワークスペースの中に。</div>
  </div>;
}
