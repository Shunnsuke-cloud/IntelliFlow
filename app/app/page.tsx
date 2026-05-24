"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppWorkspace from "../components/AppWorkspace";
import SupabaseAuth from "../components/SupabaseAuth";
import supabase from "@/lib/supabaseClient";

export default function AppPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        if (!supabase) {
          router.replace("/");
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        if (!data.session?.user) {
          router.replace("/");
          return;
        }
      } finally {
        if (mounted) setChecking(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router]);

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
      <AppWorkspace />
    </main>
  );
}
