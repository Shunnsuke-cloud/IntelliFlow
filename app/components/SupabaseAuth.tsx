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
        if (data?.user) {
          setUser(data.user);
          if (onSignedInRedirectTo) window.location.href = onSignedInRedirectTo;
        }
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
      if (data?.user) {
        setUser(data.user);
        if (onSignedInRedirectTo) window.location.href = onSignedInRedirectTo;
      }
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
      const redirectTo =
        onSignedInRedirectTo ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
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
    <div style={{ border: "1px solid #eee", padding: 12, borderRadius: 8, maxWidth: 420 }}>
          {user ? (
        <div>
          <div>Signed in as <strong>{user.email ?? user.id}</strong></div>
          <div style={{ marginTop: 8 }}>
            <button onClick={signOut} disabled={loading}>サインアウト</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => setView('signin')} disabled={view === 'signin'}>ログイン</button>
            <button onClick={() => setView('signup')} disabled={view === 'signup'}>新規登録</button>
            <button onClick={() => setView('magic')} disabled={view === 'magic'}>Magic Link</button>
          </div>

          {view === 'signup' ? (
            <form onSubmit={signUpWithEmail}>
              <label style={{ display: 'block', fontSize: 12 }}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: '100%' }} />
              <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" style={{ width: '100%' }} />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="submit" disabled={loading || !email || !password}>登録</button>
                <button type="button" onClick={signInWithGoogle} disabled={loading}>Googleでサインイン</button>
              </div>
            </form>
          ) : (
            <form onSubmit={signInWithEmail}>
              <label style={{ display: 'block', fontSize: 12 }}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: '100%' }} />
              {view !== 'magic' && (
                <>
                  <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" style={{ width: '100%' }} />
                </>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="submit" disabled={loading || !email || (view !== 'magic' && !password)}>{view === 'magic' ? 'Send Magic Link' : 'ログイン'}</button>
                <button type="button" onClick={signInWithGoogle} disabled={loading}>Googleでサインイン</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
