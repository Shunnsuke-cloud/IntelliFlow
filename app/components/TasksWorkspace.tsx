"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeNote, type SavedNote } from "@/lib/note-analysis";
import GeminiAction from "./GeminiAction";

export default function TasksWorkspace() {
  const [notes, setNotes] = useState<SavedNote[]>([]);
  useEffect(() => { fetch("/api/notes").then((res) => (res.ok ? res.json() : [])).then((items: SavedNote[]) => setNotes(items)).catch(() => undefined); }, []);
  const tasks = useMemo(() => notes.flatMap((note) => analyzeNote(note.input).tasks.map((task) => ({ ...task, noteId: note.id }))), [notes]);
  return <section className="section-block"><div className="section-heading"><p className="section-kicker">AI Tasks</p><h1>AIタスク生成</h1><p>保存済みノートから抽出された実行タスクを確認できます。</p></div><div className="saved-list">{tasks.length === 0 ? <div className="saved-empty">ノートを保存すると、ここにタスクが表示されます。</div> : tasks.map((task, index) => <article className="saved-card" key={`${task.noteId}-${index}`}><p className="mini-summary">{task.task}</p><span>期限: {task.deadline}</span></article>)}</div><section className="section-block ai-callout" style={{ padding: 24 }}><div className="section-heading"><p className="section-kicker">Gemini</p><h2>追加のタスク案を作成</h2></div><GeminiAction initialPrompt="会議メモから実行可能なタスクを3つ抽出してください。各タスクに簡単な期限案を付けてください。" /></section></section>;
}
