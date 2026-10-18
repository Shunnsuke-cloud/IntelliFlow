import SupabaseAuth from "./components/SupabaseAuth";
import { ScrollStory, FeatureStory, Reveal, ScrollProgress } from "./components/LandingStory";
import "./landing.css";

export default function Home() {
  return <main className="page-shell landing" id="top">
    <ScrollProgress />
    <noscript><style>{`.landing .gather-story { height: auto; } .landing .gather-sticky { position: static; } .landing .source-card { opacity: 1 !important; } .landing .result-chip { opacity: 1 !important; transform: none !important; } .landing .feature-sticky { display: none; } .landing .feature-track { grid-template-columns: 1fr; } .landing .feature-step { min-height: 0; } .landing .mobile-demo { position: static !important; width: auto !important; height: auto !important; clip-path: none !important; margin: 20px 0 !important; }`}</style></noscript>
    <header className="topbar"><a href="#top"><p className="eyebrow">IntelliFlow</p><p className="topbar-note">情報をつなぎ、次の人へ。</p></a><nav className="topnav" aria-label="ページ内ナビゲーション"><a href="#features">仕組み</a><a href="#roadmap">使い方</a><a href="#login">ログイン</a></nav></header>
    <ScrollStory />
    <FeatureStory />
    <Reveal className="section-block usage-section"><div className="section-heading"><p className="section-kicker">YOUR NEXT FLOW</p><h2>整理した情報を、日々の仕事へ。</h2><p>いつもの情報を入力するところから、はじめられます。</p></div><ol className="usage-flow">{[["Login", "いつもの方法でログイン", "メール / Google / メールリンク"], ["App", "課題と資料を、まとめる", "Issues / Projects / Wiki"], ["Result", "次の担当者へ、引き継ぐ", "Flow Map / Handoff / 任意のAI支援"]].map(([label, title, text]) => <li className="panel-card" key={label}><span>{label}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></Reveal>
    <Reveal className="section-block" id="roadmap"><div className="section-heading"><p className="section-kicker">毎日の活動にIntelliFlowを</p><h2>会社でも、学校でも、個人でも。</h2></div><div className="roadmap-grid">{[["01", "日々の作業", "Issue（課題）とProjectで、担当・期限・進捗を共有します。"], ["02", "知識を残す", "Wikiでマニュアルや議事録を保存し、Flow Mapで関連情報を探します。"], ["03", "次の人へ", "Handoffで経緯と未完了作業をまとめ、確認・受領を記録します。"]].map(([phase, title, text]) => <article className="roadmap-card" key={phase}><span>{phase}</span><h3>{title}</h3><p>{text}</p></article>)}</div></Reveal>
    <Reveal className="final-cta"><p className="section-kicker">LESS NOISE. MORE FLOW.</p><h2>情報共有と引き継ぎを、もっとシンプルに。</h2><p>AIは任意の補助です。通常の課題管理・検索・引き継ぎはAIなしで使えます。</p><a className="primary-button" href="#login">IntelliFlowを使ってみる <span aria-hidden="true">↗</span></a></Reveal>
    <section className="section-block login-section" id="login" aria-labelledby="login-title"><div className="section-heading"><p className="section-kicker">ログイン</p><h2 id="login-title">ここから、あなたの業務フローへ。</h2><p>サインイン後はアプリ画面へ移動します。</p></div><SupabaseAuth onSignedInRedirectTo="/app" /></section>
    <footer className="footer"><a className="eyebrow" href="#top">IntelliFlow</a><p>情報をつなぎ、次の人へ。</p><a href="#top">ページの先頭へ ↑</a></footer>
  </main>;
}
