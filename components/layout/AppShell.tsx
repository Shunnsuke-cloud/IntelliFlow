"use client";
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseClient';
import type { Workspace } from '@/lib/supabase/database';
import { Button } from '../ui/controls';
const items = [['', 'Home', 'ホーム'], ['issues', 'Issues', '課題'], ['projects', 'Projects', 'プロジェクト'], ['wiki', 'Wiki', '資料・手順'], ['flow', 'Flow Map', '関連マップ'], ['handoffs', 'Handoff', '引き継ぎ'], ['settings', 'Settings', '設定']] as const;
export default function AppShell({ children, workspaces, email }: { children: ReactNode; workspaces: Workspace[]; email: string }) {
  const path = usePathname(); const router = useRouter();
  const selected = path.match(/^\/app\/w\/([^/]+)/)?.[1] ?? '';
  const [mobile, setMobile] = useState(false); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [dark, setDark] = useState(false);
  useEffect(() => {
    let stored: string | null = null; try { stored = localStorage.getItem('intelliflow-theme'); } catch { /* optional preference */ }
    const active = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = active ? 'dark' : 'light';
    // Hydrate the preference only after mounting.
    queueMicrotask(() => setDark(active));
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) window.location.replace('/login');
    });
    return () => data.subscription.unsubscribe();
  }, []);
  function theme() { const value = !dark; setDark(value); document.documentElement.dataset.theme = value ? 'dark' : 'light'; try { localStorage.setItem('intelliflow-theme', value ? 'dark' : 'light'); } catch { /* optional preference */ } }
  async function logout() {
    setBusy(true); setError('');
    try { if (!supabase) throw new Error(); const { error } = await supabase.auth.signOut(); if (error) throw error; router.replace('/login'); router.refresh(); }
    catch { setError('ログアウトできませんでした。もう一度お試しください。'); setBusy(false); }
  }
  return <div className="if-app"><a className="if-skip" href="#workspace-content">本文へ移動</a>
    <aside className={`if-sidebar ${mobile ? 'is-open' : ''}`} id="workspace-sidebar">
      <Link href="/app" className="if-brand" onClick={() => setMobile(false)}>IntelliFlow<span>情報をつなぎ、次の人へ。</span></Link>
      <label className="if-field"><span>ワークスペース</span><select value={selected} onChange={e => { setMobile(false); router.push(e.target.value ? `/app/w/${e.target.value}` : '/app'); }}><option value="">一覧・新しく作成</option>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <nav aria-label="メインナビゲーション">{items.map(([slug, label, ja]) => {
        const href = selected ? `/app/w/${selected}${slug ? `/${slug}` : ''}` : '/app';
        return <Link key={label} href={href} aria-current={path === href || (!!slug && path.startsWith(href + '/')) ? 'page' : undefined} onClick={() => setMobile(false)}><span>{label}<small>{ja}</small></span>{['wiki', 'flow', 'handoffs'].includes(slug) && <em>準備中</em>}</Link>;
      })}</nav>
      <Link href="/app/notes" onClick={() => setMobile(false)}>旧ノートを開く</Link>
    </aside>
    <div className="if-main"><header className="if-header"><Button className="if-menu-toggle" aria-expanded={mobile} aria-controls="workspace-sidebar" onClick={() => setMobile(!mobile)}>{mobile ? 'メニューを閉じる' : 'メニュー'}</Button><span>{workspaces.find(w => w.id === selected)?.name ?? 'ワークスペース'}</span><div className="if-user-tools"><Button onClick={theme} aria-pressed={dark}>{dark ? 'ライトモード' : 'ダークモード'}</Button><details><summary>ユーザーメニュー</summary><div className="if-user-menu"><p>{email}</p><Button disabled={busy} onClick={logout}>{busy ? '処理中…' : 'ログアウト'}</Button></div></details></div></header>
      {error && <p className="if-error" role="alert">{error}</p>}<main id="workspace-content" className="if-content">{children}</main>
    </div>
  </div>;
}
