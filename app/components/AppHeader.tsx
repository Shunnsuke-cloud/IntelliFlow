"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/app", label: "ダッシュボード", exact: true },
  { href: "/app/notes", label: "AIノート" },
  { href: "/app/tasks", label: "タスク" },
  { href: "/app/flow", label: "Flow" },
  { href: "/app/search", label: "AI検索" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-brand" href="/app" aria-label="IntelliFlow ダッシュボード">
          <span>IntelliFlow</span>
          <small>AI Workspace</small>
        </Link>
        <nav className="app-navigation" aria-label="アプリケーションナビゲーション">
          {navigation.map(({ href, label, exact }) => {
            const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link key={href} className={isActive ? "app-nav-link active" : "app-nav-link"} href={href}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
