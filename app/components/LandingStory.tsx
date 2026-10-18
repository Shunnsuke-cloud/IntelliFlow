"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";

const sources = [
  { title: "Issue（課題）", text: "イベント受付を改善", x: -170, y: -112 },
  { title: "Project", text: "次回のイベント", x: 170, y: -102 },
  { title: "Wiki", text: "受付のマニュアル", x: -185, y: 0 },
  { title: "Handoff", text: "次の担当者へ引き継ぎ", x: 185, y: 8 },
  { title: "過去のIssue", text: "昨年の混雑の記録", x: -150, y: 112 },
  { title: "議事録", text: "改善の経緯を残す", x: 150, y: 122 },
];
const results = [["Issue", "受付を改善"], ["Project", "次回のイベント"], ["Wiki", "受付の手順"], ["Flow Map", "関連資料をたどる"], ["Handoff", "次の担当者へ"]];
const steps = [
  { title: "課題と資料を残す", text: "Issueで担当・期限を管理し、Wikiに手順や議事録を保存。Projectで活動をまとめます。", label: "RECORD", rows: ["Issue：受付の混雑を改善", "Wiki：受付マニュアル", "Project：次回のイベント"] },
  { title: "過去の情報を探す", text: "Flow Mapで課題と資料を検索し、保存されたつながりから経緯をたどれます。", label: "FIND", rows: ["受付の問題をキーワード検索", "関連するWikiを確認", "元の課題・資料を開く"] },
  { title: "次の人へ引き継ぐ", text: "Handoffで進捗、未完了作業、注意事項をまとめます。送信時の内容と受領した版を記録します。", label: "HANDOFF", rows: ["現在の進捗と次の行動", "関連Issue・Wikiへのリンク", "受領者と確認した版を記録"] },
  { title: "必要なときだけAIに相談", text: "AIは検索の整理と引き継ぎ下書きを補助します。外部送信に同意して利用し、提案を確認してから採用します。", label: "ASSIST", rows: ["AIへ明示的に質問", "回答と根拠の資料を確認", "下書きを編集して、自分で保存"] },
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
    <div className="hero-copy"><p className="eyebrow">課題管理・情報共有・引き継ぎ支援</p><h1 id="hero-title">情報をつなぎ、<br />次の人へ。</h1><p className="lead">会社・学校・チーム・個人の活動に。<br />課題と資料をつなぎ、<br />経緯と次の行動を引き継ぎます。</p><div className="hero-actions"><a className="primary-button" href="#login">ログインして使う <span aria-hidden="true">↗</span></a><a className="secondary-button" href="#features">仕組みを見る</a></div><p className="scroll-hint">スクロールして、情報が仕事に変わる流れを見る <span aria-hidden="true">↓</span></p></div>
    <div className="gather-visual" role="group" aria-label="課題・資料・引き継ぎをつなぐ例"><p className="visual-caption">ばらばらの情報を、ひとつの流れへ</p><div className="gather-stage"><div className="orbit-ring" aria-hidden="true" /><ul className="source-list">{sources.map((source, index) => <SourceCard key={source.title} source={source} index={index} progress={progress} />)}</ul><motion.div className="intelliflow-core" style={reduced ? {} : { scale: coreScale }}><span className="core-symbol" aria-hidden="true">IF</span><strong>IntelliFlow</strong><small>情報をつなぐ</small></motion.div></div><div className="result-connector" aria-hidden="true">↓</div><p className="result-heading">整理された情報 <span>出力イメージ</span></p><ul className="result-list">{results.map((item, index) => <ResultCard key={item[0]} item={item} index={index} progress={progress} />)}</ul></div>
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
  return <section className={`feature-story section-block${reduced ? " motion-reduced" : ""}`} id="features" aria-labelledby="feature-title"><Reveal className="section-heading"><p className="section-kicker">FROM INFORMATION TO ACTION</p><h2 id="feature-title">情報が整理されると、<br />仕事の次の一歩が見えてくる。</h2><p>課題と資料を残し、次の担当者へ引き継ぐまで。</p></Reveal><div className="feature-track" ref={target}><div className="feature-sticky"><div className="feature-demo">{steps.map((_, index) => <FeaturePanel key={index} index={index} progress={scrollYProgress} />)}</div><p className="demo-disclaimer">サービスの仕組みを伝えるサンプル画面です。</p></div><ol className="feature-steps">{steps.map((step, index) => <li className="feature-step" key={step.title}><Reveal><p className="section-kicker">STEP 0{index + 1}</p><h3>{step.title}</h3><p>{step.text}</p><ul className="mobile-demo">{step.rows.map(row => <li key={row}>{row}</li>)}</ul></Reveal></li>)}</ol></div></section>;
}
