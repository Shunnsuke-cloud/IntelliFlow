import type { ReactNode } from "react";
import AppHeader from "../components/AppHeader";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-shell">
      <AppHeader />
      {children}
    </div>
  );
}
