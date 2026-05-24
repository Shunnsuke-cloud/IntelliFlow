"use client";

import React, { useEffect, useState } from "react";
import supabase from "@/lib/supabaseClient";

type Props = {
  onSignedInRedirectTo?: string;
  onSignedOutRedirectTo?: string;
};

export default function SupabaseAuth({ onSignedInRedirectTo, onSignedOutRedirectTo }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<'signin'|'signup'|'magic'>('signin');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!supabase) {
      setUser(null);
      return () => {
        mounted = false;
      };
    }

    supabase.auth.getSession().then((res) => {
      if (!mounted) return;
      setUser(res.data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      try {
        sub.subscription.unsubscribe();
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (!user || !onSignedInRedirectTo) return;

    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    if (currentPath !== onSignedInRedirectTo) {
      window.location.replace(onSignedInRedirectTo);
    }
  }, [user, onSignedInRedirectTo]);

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      if (view === 'magic') {
        await supabase.auth.signInWithOtp({ email });
        alert("サインイン用のリンクをメールで送信しました。");
      } else {
        // signin with email/password
        if (!password) throw new Error('パスワードを入力してください');
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.user) setUser(data.user);
      }
    } catch (err: any) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      if (!email || !password) throw new Error('Email とパスワードを入力してください');
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      alert('登録に成功しました。メールの確認をお願いします（必要な場合）。');
      if (data?.user) setUser(data.user);
    } catch (err: any) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const redirectTo = (() => {
        if (typeof window === 'undefined') return undefined;
        const target = onSignedInRedirectTo ?? '/';
        if (target.startsWith('http://') || target.startsWith('https://')) return target;
        return new URL(target, window.location.origin).toString();
      })();
      await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    } catch (err: any) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      await supabase.auth.signOut();
      if (onSignedOutRedirectTo) window.location.href = onSignedOutRedirectTo;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      {user ? (
        <div className="auth-signed-in">
          <div className="auth-signed-in-label">Signed in</div>
          <div className="auth-signed-in-value">{user.email ?? user.id}</div>
          <div className="auth-actions">
            <button className="secondary-button" onClick={signOut} disabled={loading}>
              サインアウト
            </button>
          </div>
        </div>
      ) : (
        <div className="auth-form-stack">
          <div className="auth-switcher">
            <button className={view === 'signin' ? 'auth-switcher-button active' : 'auth-switcher-button'} onClick={() => setView('signin')} disabled={view === 'signin'}>
              ログイン
            </button>
            <button className={view === 'signup' ? 'auth-switcher-button active' : 'auth-switcher-button'} onClick={() => setView('signup')} disabled={view === 'signup'}>
              新規登録
            </button>
            <button className={view === 'magic' ? 'auth-switcher-button active' : 'auth-switcher-button'} onClick={() => setView('magic')} disabled={view === 'magic'}>
              Magic Link
            </button>
          </div>

          {view === 'signup' ? (
            <form className="auth-form" onSubmit={signUpWithEmail}>
              <label className="auth-label">Email</label>
              <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <label className="auth-label">Password</label>
              <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
              <div className="auth-actions">
                <button className="primary-button" type="submit" disabled={loading || !email || !password}>
                  登録
                </button>
                <button className="secondary-button" type="button" onClick={signInWithGoogle} disabled={loading}>
                  Googleでサインイン
                </button>
              </div>
            </form>
          ) : (
            <form className="auth-form" onSubmit={signInWithEmail}>
              <label className="auth-label">Email</label>
              <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              {view !== 'magic' && (
                <>
                  <label className="auth-label">Password</label>
                  <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
                </>
              )}
              <div className="auth-actions">
                <button className="primary-button" type="submit" disabled={loading || !email || (view !== 'magic' && !password)}>
                  {view === 'magic' ? 'Send Magic Link' : 'ログイン'}
                </button>
                <button className="secondary-button" type="button" onClick={signInWithGoogle} disabled={loading}>
                  Googleでサインイン
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
