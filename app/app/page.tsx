"use client";

import { useEffect, useState } from "react";
import AppWorkspace from "../components/AppWorkspace";
import SupabaseAuth from "../components/SupabaseAuth";
import supabase from "@/lib/supabaseClient";

export default function AppPage() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function checkSession() {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        if (!supabase) {
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const sessionUser = data.session?.user ?? null;
        setHasSession(Boolean(sessionUser));

        if (!sessionUser) {
          await sleep(2500);
          if (!mounted) return;

          const retry = await supabase.auth.getSession();
          if (!mounted) return;

          const retryUser = retry.data.session?.user ?? null;
          setHasSession(Boolean(retryUser));
        }
      } finally {
        if (mounted) setChecking(false);
      }
    }

    checkSession();

    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        setHasSession(Boolean(session?.user));
        setChecking(false);
      });

      timeoutId = setTimeout(() => {
        if (!mounted) return;
        setChecking(false);
      }, 5000);

      return () => {
        mounted = false;
        try {
          data.subscription.unsubscribe();
        } catch {}
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (checking) {
    return (
      <main className="page-shell">
        <div className="section-card">
          <p className="section-kicker">Loading</p>
          <h2>認証状態を確認しています...</h2>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell" id="top">
      <header className="topbar">
        <div>
          <p className="eyebrow">IntelliFlow App</p>
          <p className="topbar-note">ログイン後に使う業務本体ページ</p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SupabaseAuth onSignedOutRedirectTo="/" />
        </div>
      </header>
      {!hasSession ? (
        <div className="section-card">
          <p className="section-kicker">Session</p>
          <h2>ログインが必要です。</h2>
          <p>このページはログイン後に使う作業スペースです。上部のログインから認証してください。</p>
          <div style={{ marginTop: 12 }}>
            <SupabaseAuth onSignedInRedirectTo="/app" onSignedOutRedirectTo="/" />
          </div>
        </div>
      ) : null}
      {hasSession ? <AppWorkspace /> : null}
    </main>
  );
}
