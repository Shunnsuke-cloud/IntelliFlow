import SupabaseAuth from "./components/SupabaseAuth";
import { ScrollStory, FeatureStory, Reveal, ScrollProgress } from "./components/LandingStory";
import "./landing.css";

export default function Home() {
  return <main className="page-shell landing" id="top">
    <ScrollProgress />
    <noscript><style>{`.landing .gather-story { height: auto; } .landing .gather-sticky { position: static; } .landing .source-card { opacity: 1 !important; } .landing .result-chip { opacity: 1 !important; transform: none !important; } .landing .feature-sticky { display: none; } .landing .feature-track { grid-template-columns: 1fr; } .landing .feature-step { min-height: 0; } .landing .mobile-demo { position: static !important; width: auto !important; height: auto !important; clip-path: none !important; margin: 20px 0 !important; }`}</style></noscript>
    <header className="topbar"><a href="#top"><p className="eyebrow">IntelliFlow</p><p className="topbar-note">AIで、業務の流れを整える。</p></a><nav className="topnav" aria-label="ページ内ナビゲーション"><a href="#features">仕組み</a><a href="#roadmap">今後</a><a href="#login">ログイン</a></nav></header>
    <ScrollStory />
    <FeatureStory />
    <Reveal className="section-block usage-section"><div className="section-heading"><p className="section-kicker">YOUR NEXT FLOW</p><h2>整理した情報を、日々の仕事へ。</h2><p>いつもの情報を入力するところから、はじめられます。</p></div><ol className="usage-flow">{[["Login", "いつもの方法でログイン", "メール / Google / Magic Link"], ["App", "情報をまとめて、整理する", "ノート整理 / タスク化 / 検索"], ["Result", "次にやることが見える", "タスクや決定事項を、業務の流れへ"]].map(([label, title, text]) => <li className="panel-card" key={label}><span>{label}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></Reveal>
    <Reveal className="section-block" id="roadmap"><div className="section-heading"><p className="section-kicker">これからのIntelliFlow</p><h2>現場の仕事に、少しずつ深く。</h2></div><div className="roadmap-grid">{[["Phase 1", "MVP", "ノート整理、タスク抽出、検索の基本フローを確実に使える状態にします。"], ["Phase 2", "運用定着", "共有導線や通知連携を加えて日常運用に馴染ませます。"], ["Phase 3", "AI拡張", "音声入力、より高度な要約、意思決定支援まで広げていきます。"]].map(([phase, title, text]) => <article className="roadmap-card" key={phase}><span>{phase}</span><h3>{title}</h3><p>{text}</p></article>)}</div></Reveal>
    <Reveal className="final-cta"><p className="section-kicker">LESS NOISE. MORE FLOW.</p><h2>情報整理を、もっとシンプルに。</h2><p>散らばった情報を、次の一歩に変えましょう。</p><a className="primary-button" href="#login">IntelliFlowを使ってみる <span aria-hidden="true">↗</span></a></Reveal>
    <section className="section-block login-section" id="login" aria-labelledby="login-title"><div className="section-heading"><p className="section-kicker">ログイン</p><h2 id="login-title">ここから、あなたの業務フローへ。</h2><p>サインイン後はアプリ画面へ移動します。</p></div><SupabaseAuth onSignedInRedirectTo="/app" /></section>
    <footer className="footer"><a className="eyebrow" href="#top">IntelliFlow</a><p>情報を、業務の流れに変える。</p><a href="#top">ページの先頭へ ↑</a></footer>
  </main>;
}
