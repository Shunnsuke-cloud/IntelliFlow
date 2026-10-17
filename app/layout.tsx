import type { Metadata } from "next";
import "./globals.css";
import "./app/workspace.css";
import "../features/work-items/work-items.css";
import "../features/wiki/wiki.css";
import '@xyflow/react/dist/style.css';
import '../features/flow/flow.css';
import '../features/handoffs/handoffs.css';

export const metadata: Metadata = {
  title: "IntelliFlow",
  description:
    "AIで散在した業務情報を整理・要約・構造化し、業務の流れを最適化する業務支援プラットフォームです。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
