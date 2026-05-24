import SupabaseAuth from "./components/SupabaseAuth";

export default function Home() {
  return (
    <main className="page-shell" id="top">
      <header className="topbar">
        <div>
          <p className="eyebrow">IntelliFlow</p>
          <p className="topbar-note">AIで業務の流れを整える小規模事業者向けプラットフォーム</p>
        </div>
        <nav className="topnav" aria-label="ページ内ナビゲーション">
          <a href="#login">ログイン</a>
          <a href="#features">特徴</a>
          <a href="#roadmap">今後</a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">業務支援プラットフォーム</p>
          <h1>情報を、業務の流れに変える。</h1>
          <p className="lead">
            IntelliFlowは、会議メモ、チャット、業務指示などの非構造データをAIで整理し、
            「やるべきこと」と「意思決定」を明確にする業務支援サービスです。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#login">
              ログインして使う
            </a>
            <a className="secondary-button" href="#features">
              機能を見る
            </a>
          </div>
        </div>

        <aside className="hero-panel" aria-label="IntelliFlowの流れの概念図">
          <div className="panel-card accent">
            <span>Login</span>
            <strong>メール / Google / Magic Link</strong>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="panel-card">
            <span>App</span>
            <strong>ノート整理 / タスク化 / 検索</strong>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="panel-card highlight">
            <span>Result</span>
            <strong>現場で使える業務フロー</strong>
          </div>
        </aside>
      </section>

      <section className="section-block" id="login">
        <div className="section-heading">
          <p className="section-kicker">ログイン</p>
          <h2>サインイン後はアプリ画面へ移動します。</h2>
        </div>
        <div style={{ maxWidth: 520 }}>
          <SupabaseAuth onSignedInRedirectTo="/app" />
        </div>
      </section>

      <section className="section-block" id="features">
        <div className="section-heading">
          <p className="section-kicker">特徴</p>
          <h2>トップページは案内だけにして、作業画面はログイン後に分離。</h2>
        </div>
        <div className="card-grid">
          <article className="info-card">
            <h3>認証後に本体へ</h3>
            <p>ログインが完了すると、アプリ本体の `/app` に遷移します。</p>
          </article>
          <article className="info-card">
            <h3>メール / Google</h3>
            <p>メール認証、Magic Link、Google OAuth の入口を用意しています。</p>
          </article>
          <article className="info-card">
            <h3>本体は別ページ</h3>
            <p>ログイン前は案内ページ、ログイン後に業務画面を表示します。</p>
          </article>
        </div>
      </section>

      <section className="section-block" id="roadmap">
        <div className="section-heading">
          <p className="section-kicker">今後</p>
          <h2>まずは現場で使える最小構成から。</h2>
        </div>
        <div className="roadmap-grid">
          <article className="roadmap-card">
            <span>Phase 1</span>
            <h3>MVP</h3>
            <p>ノート整理、タスク抽出、検索の基本フローを確実に使える状態にします。</p>
          </article>
          <article className="roadmap-card">
            <span>Phase 2</span>
            <h3>運用定着</h3>
            <p>共有導線や通知連携を加えて日常運用に馴染ませます。</p>
          </article>
          <article className="roadmap-card">
            <span>Phase 3</span>
            <h3>AI拡張</h3>
            <p>音声入力、より高度な要約、意思決定支援まで広げていきます。</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <div>
          <p className="eyebrow">Next Step</p>
          <h2>ログインしてアプリの本体に進んでください。</h2>
        </div>
        <a className="primary-button" href="#login">
          ログインへ
        </a>
      </footer>
    </main>
  );
}
