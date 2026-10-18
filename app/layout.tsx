import type { Metadata } from "next";
import "./globals.css";
import "./app/workspace.css";
import "../features/work-items/work-items.css";
import "../features/wiki/wiki.css";
import '@xyflow/react/dist/style.css';
import '../features/flow/flow.css';
import '../features/handoffs/handoffs.css';
import '../features/ai/ai.css';

export const metadata: Metadata = {
  title: "IntelliFlow",
  description:
    "IntelliFlow — 情報をつなぎ、次の人へ。課題管理・情報共有・引き継ぎを支えるWebアプリケーション。",
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
