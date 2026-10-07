"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";

const sources = [
  { title: "会議メモ", text: "新プランは来月公開", x: -170, y: -112 },
  { title: "メール", text: "資料を金曜までに", x: 170, y: -102 },
  { title: "顧客からの依頼", text: "見積もりをお願いします", x: -185, y: 0 },
  { title: "チャット", text: "デザインは田中さんへ", x: 185, y: 8 },
  { title: "業務指示", text: "公開前に内容を確認", x: -150, y: 112 },
  { title: "アイデア", text: "案内をもっとシンプルに", x: 150, y: 122 },
];
const results = [["タスク", "提案資料を作成"], ["決定事項", "新プランを来月公開"], ["担当者", "田中さん"], ["優先順位", "高"], ["期限", "金曜日"]];
const steps = [
  { title: "情報を入力", text: "会議メモやメール、チャットの内容をひとつのノートに。まとまっていない文章でも、そのまま入力できます。", label: "INPUT", rows: ["来月、新プランを公開することに。", "田中さんが提案資料を作成。", "金曜までに、優先して対応。"] },
  { title: "AIが内容を解析", text: "文章の文脈を読み取り、依頼・決定・担当・期限を整理。情報のつながりが見えてきます。", label: "ANALYZE", rows: ["決定 → 新プランを来月公開", "依頼 → 提案資料の作成", "担当・期限 → 田中さん / 金曜日"] },
  { title: "タスク・決定事項を抽出", text: "やるべきことと、すでに決まったことを分けて表示。担当者や優先順位、期限も確認できます。", label: "EXTRACT", rows: ["✓ タスク：提案資料を作成", "✓ 決定事項：来月公開", "✓ 優先順位：高 / 期限：金曜日"] },
  { title: "業務フローとして整理", text: "整理した情報を確認し、次にやることへ。誰が、いつまでに、何をするかをチームの仕事につなげます。", label: "FLOW", rows: ["01 田中さん → 提案資料を作成", "02 金曜日 → 内容を確認", "03 来月 → 新プランを公開"] },
];

export function Reveal({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const reduced = useReducedMotion();
  return <motion.div id={id} className={className} initial={false} whileInView={reduced ? {} : { y: [24, 0], opacity: [0, 1] }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: reduced ? 0 : 0.5 }}>{children}</motion.div>;
}
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  const smooth = useSpring(scrollYProgress, { stiffness: 180, damping: 35 });
  return <motion.div aria-hidden="true" className="scroll-progress" style={{ scaleX: reduced ? scrollYProgress : smooth }} />;
}
function SourceCard({ source, index, progress }: { source: typeof sources[number]; index: number; progress: MotionValue<number> }) {
  const reduced = useReducedMotion();
  const x = useTransform(progress, [0.08, 0.48], [source.x, 0]);
  const y = useTransform(progress, [0.08, 0.48], [source.y, 0]);
  const opacity = useTransform(progress, [0.32, 0.5], [1, 0]);
  const scale = useTransform(progress, [0.08, 0.48], [1, 0.65]);
  return <motion.li className="source-card" style={reduced ? {} : { x, y, opacity, scale }}><motion.div initial={false} whileInView={reduced ? {} : { opacity: [0, 1] }} viewport={{ once: true, amount: 0.2 }} animate={reduced ? {} : { y: [0, -3, 0] }} transition={{ y: { duration: 5 + index * 0.4, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.4, delay: index * 0.06 } }}><span className="source-icon" aria-hidden="true">{["▤", "✉", "◇", "≡", "▱", "+"][index]}</span><strong>{source.title}</strong><small>{source.text}</small></motion.div></motion.li>;
}
function ResultCard({ item, index, progress }: { item: string[]; index: number; progress: MotionValue<number> }) {
  const reduced = useReducedMotion();
  const start = 0.5 + index * 0.045;
  const opacity = useTransform(progress, [start, start + 0.1], [0, 1]);
  const y = useTransform(progress, [start, start + 0.1], [22, 0]);
  return <motion.li className="result-chip" style={reduced ? {} : { opacity, y }}><span aria-hidden="true">✓</span><div><strong>{item[0]}</strong><small>{item[1]}</small></div></motion.li>;
}
export function ScrollStory() {
  const target = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 130, damping: 30 });
  const reduced = useReducedMotion();
  const coreScale = useTransform(progress, [0, 0.5, 0.8], [1, 1.04, 1]);
  return <section className={`gather-story${reduced ? " motion-reduced" : ""}`} ref={target} aria-labelledby="hero-title"><div className="gather-sticky">
    <div className="hero-copy"><p className="eyebrow">業務支援プラットフォーム</p><h1 id="hero-title">情報を、<br />業務の流れに変える。</h1><p className="lead">会議メモも、メールも、チャットも。<br />散らばった情報をAIで整理し、<br />「やるべきこと」と「意思決定」を明確に。</p><div className="hero-actions"><a className="primary-button" href="#login">ログインして使う <span aria-hidden="true">↗</span></a><a className="secondary-button" href="#features">仕組みを見る</a></div><p className="scroll-hint">スクロールして、情報が仕事に変わる流れを見る <span aria-hidden="true">↓</span></p></div>
    <div className="gather-visual" role="group" aria-label="情報を集め、AIで整理するイメージ"><p className="visual-caption">ばらばらの情報を、ひとつの流れへ</p><div className="gather-stage"><div className="orbit-ring" aria-hidden="true" /><ul className="source-list">{sources.map((source, index) => <SourceCard key={source.title} source={source} index={index} progress={progress} />)}</ul><motion.div className="intelliflow-core" style={reduced ? {} : { scale: coreScale }}><span className="core-symbol" aria-hidden="true">IF</span><strong>IntelliFlow</strong><small>AIで情報を整理</small></motion.div></div><div className="result-connector" aria-hidden="true">↓</div><p className="result-heading">整理された情報 <span>出力イメージ</span></p><ul className="result-list">{results.map((item, index) => <ResultCard key={item[0]} item={item} index={index} progress={progress} />)}</ul></div>
  </div></section>;
}
function FeaturePanel({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const start = index / 4;
  const opacity = useTransform(progress, index === 0 ? [0, 0.21, 0.25] : index === 3 ? [0.71, 0.75, 1] : [start - 0.04, start, start + 0.21, start + 0.25], index === 0 ? [1, 1, 0] : index === 3 ? [0, 1, 1] : [0, 1, 1, 0]);
  const y = useTransform(opacity, [0, 1], [16, 0]);
  const step = steps[index];
  return <motion.div aria-hidden="true" className="feature-panel" style={{ opacity, y }}><div className="demo-topline"><span className="demo-dots">● ● ●</span><span>IntelliFlow / {step.label}</span></div><p className="section-kicker">STEP 0{index + 1}</p><h3>{step.title}</h3><div className={`demo-rows demo-${index}`}>{step.rows.map((row, i) => <div key={row}>{row}{index === 1 && <span className="analysis-line" style={{ width: `${85 - i * 15}%` }} />}</div>)}</div><div className="demo-bottom"><span>情報</span><span>→</span><strong>{step.label}</strong><span>→</span><span>次のアクション</span></div></motion.div>;
}
export function FeatureStory() {
  const target = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start center", "end center"] });
  return <section className={`feature-story section-block${reduced ? " motion-reduced" : ""}`} id="features" aria-labelledby="feature-title"><Reveal className="section-heading"><p className="section-kicker">FROM INFORMATION TO ACTION</p><h2 id="feature-title">情報が整理されると、<br />仕事の次の一歩が見えてくる。</h2><p>ひとつの会議メモが、業務の流れになるまで。</p></Reveal><div className="feature-track" ref={target}><div className="feature-sticky"><div className="feature-demo">{steps.map((_, index) => <FeaturePanel key={index} index={index} progress={scrollYProgress} />)}</div><p className="demo-disclaimer">サービスの仕組みを伝えるサンプル画面です。</p></div><ol className="feature-steps">{steps.map((step, index) => <li className="feature-step" key={step.title}><Reveal><p className="section-kicker">STEP 0{index + 1}</p><h3>{step.title}</h3><p>{step.text}</p><ul className="mobile-demo">{step.rows.map(row => <li key={row}>{row}</li>)}</ul></Reveal></li>)}</ol></div></section>;
}
