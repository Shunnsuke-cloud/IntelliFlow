"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeNote, type SavedNote } from "@/lib/note-analysis";
import GeminiAction from "./GeminiAction";

export default function TasksWorkspace() {
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); fetch('/api/notes', { signal: controller.signal }).then(async res => { if (!res.ok) throw new Error(); return res.json(); }).then((items: SavedNote[]) => setNotes(items)).catch(() => { if (!controller.signal.aborted) setError('ノートを読み込めませんでした。再読み込みしてください。'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  const tasks = useMemo(() => notes.flatMap((note) => analyzeNote(note.input).tasks.map((task) => ({ ...task, noteId: note.id }))), [notes]);
  return <section className="section-block"><div className="section-heading"><p className="section-kicker">LEGACY TASKS</p><h1>旧ノートのタスク候補</h1><p>簡易ルールで抽出した候補です。担当者・期限・内容を確認し、ワークスペースのIssueで管理してください。</p></div><div className="saved-list">{error ? <p role="alert" className="if-error">{error}</p> : loading ? <p role="status">読み込んでいます…</p> : tasks.length === 0 ? <div className="saved-empty">ノートを保存すると、ここにタスクが表示されます。</div> : tasks.map((task, index) => <article className="saved-card" key={`${task.noteId}-${index}`}><p className="mini-summary">{task.task}</p><span>期限: {task.deadline}</span></article>)}</div><section className="section-block ai-callout" style={{ padding: 24 }}><div className="section-heading"><p className="section-kicker">Gemini</p><h2>追加のタスク案を作成</h2></div><GeminiAction initialPrompt="会議メモから実行可能なタスクを3つ抽出してください。各タスクに簡単な期限案を付けてください。" /></section></section>;
}
