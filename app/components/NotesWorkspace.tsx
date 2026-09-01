"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeNote, type SavedNote } from "@/lib/note-analysis";

const sampleText = "来週までに在庫確認とSNS投稿を進める。会議では新メニューの告知方針を決める。";

export default function NotesWorkspace() {
  const [input, setInput] = useState(sampleText);
  const [submittedText, setSubmittedText] = useState(sampleText);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const analysis = useMemo(() => analyzeNote(submittedText), [submittedText]);

  useEffect(() => {
    fetch("/api/notes").then((res) => (res.ok ? res.json() : [])).then((notes: SavedNote[]) => setSavedNotes(notes)).catch(() => undefined);
  }, []);

  async function saveNote() {
    const source = submittedText.trim();
    if (!source) return;
    const isEditing = editingNoteId !== null;
    const res = await fetch("/api/notes", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEditing ? { id: editingNoteId, input: source } : { input: source }),
    });
    if (!res.ok) return;
    const note = (await res.json()) as SavedNote;
    setSavedNotes((current) => [note, ...current.filter((item) => item.id !== note.id && item.input !== source)]);
    setEditingNoteId(null);
  }

  async function deleteNote(id: string) {
    const res = await fetch("/api/notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) setSavedNotes((current) => current.filter((note) => note.id !== id));
  }

  return (
    <section className="section-block">
      <div className="section-heading"><p className="section-kicker">AI Notes</p><h1>AIノート整理</h1><p>会議メモや文章を入力すると、要約・重要ポイント・決定事項を整理します。</p></div>
      <div className="input-lab">
        <form className="input-panel" onSubmit={(event) => { event.preventDefault(); setSubmittedText(input); }}>
          <label className="input-label" htmlFor="note-input">会議メモ・チャット・業務指示</label>
          <textarea id="note-input" value={input} onChange={(event) => setInput(event.target.value)} rows={12} />
          <div className="input-actions"><button className="primary-button" type="submit">解析する</button><button className="secondary-button" type="button" onClick={() => { setInput(sampleText); setSubmittedText(sampleText); }}>例文を入れる</button><button className="secondary-button" type="button" onClick={saveNote}>{editingNoteId ? "更新する" : "保存する"}</button></div>
        </form>
        <div className="analysis-panel" aria-live="polite">
          <article className="analysis-card"><span>要約</span><p>{analysis.summary}</p></article>
          <article className="analysis-card"><span>重要ポイント</span><ul>{analysis.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul></article>
          <article className="analysis-card"><span>タスク</span><ul>{analysis.tasks.map((task) => <li key={`${task.task}-${task.deadline}`}>{task.task} <strong>（期限: {task.deadline}）</strong></li>)}</ul></article>
          <article className="analysis-card"><span>決定事項</span><p>{analysis.decision}</p></article>
        </div>
      </div>
      <div className="saved-panel"><div className="section-heading"><p className="section-kicker">Saved notes</p><h2>保存したノート</h2></div>{savedNotes.length === 0 ? <div className="saved-empty">まだ保存したメモはありません。</div> : <div className="saved-list">{savedNotes.map((note) => <article className="saved-card" key={note.id}><div className="card-row"><span>{note.savedAt}</span><button className="delete-button" onClick={() => deleteNote(note.id)}>削除</button></div><p>{note.input}</p><div className="input-actions"><button className="link-button" onClick={() => { setInput(note.input); setSubmittedText(note.input); setEditingNoteId(note.id); }}>編集する</button></div></article>)}</div>}</div>
    </section>
  );
}
