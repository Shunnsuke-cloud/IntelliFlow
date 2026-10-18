"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeNote, type SavedNote } from "@/lib/note-analysis";

const sampleText = "来週までに在庫確認とSNS投稿を進める。会議では新メニューの告知方針を決める。";

export default function NotesWorkspace() {
  const [input, setInput] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [saved, setSaved] = useState('');
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const analysis = useMemo(() => analyzeNote(submittedText), [submittedText]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/notes', { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as SavedNote[]; }).then(setSavedNotes).catch(() => { if (!controller.signal.aborted) setError('ノートを読み込めませんでした。再読み込みしてください。'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function saveNote() {
    const source = input.trim();
    if (!source || busy) return;
    setBusy(true); setError(''); setSaved('');
    try {
    const isEditing = editingNoteId !== null;
    const res = await fetch("/api/notes", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEditing ? { id: editingNoteId, input: source } : { input: source }),
    });
    if (!res.ok) throw new Error();
    const note = (await res.json()) as SavedNote;
    setSavedNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    setEditingNoteId(null);
    setSubmittedText(source); setSaved('ノートを保存しました。');
    } catch { setError('保存できませんでした。入力内容・接続を確認してください。'); } finally { setBusy(false); }
  }

  async function deleteNote(id: string) {
    if (busy) return; setBusy(true); setError(''); setSaved('');
    try {
    const res = await fetch("/api/notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) throw new Error(); setSavedNotes((current) => current.filter((note) => note.id !== id));
    if (editingNoteId === id) { setEditingNoteId(null); setInput(''); setSubmittedText(''); }
    setSaved('ノートを削除しました。');
    } catch { setError('削除できませんでした。再度お試しください。'); } finally { setBusy(false); }
  }

  return (
    <section className="section-block">
      <div className="section-heading"><p className="section-kicker">LEGACY NOTES</p><h1>旧ノート</h1><p>保存済みノートを引き続き利用できます。下の整理結果は簡易ルールによる候補です。AI支援はワークスペースから利用してください。</p></div>
      {error && <p role="alert" className="if-error">{error}</p>}{saved && <p role="status">{saved}</p>}{loading && <p role="status">保存済みノートを読み込んでいます…</p>}
      <div className="input-lab">
        <form className="input-panel" onSubmit={(event) => { event.preventDefault(); setSubmittedText(input); }}>
          <label className="input-label" htmlFor="note-input">会議メモ・チャット・業務指示</label>
          <textarea maxLength={10000} disabled={busy} placeholder="保存するメモを入力してください" id="note-input" value={input} onChange={(event) => setInput(event.target.value)} rows={12} />
          <div className="input-actions"><button className="primary-button" disabled={busy || !input.trim()} type="submit">整理の候補を見る</button><button className="secondary-button" disabled={busy} type="button" onClick={() => { setInput(sampleText); setSubmittedText(sampleText); setEditingNoteId(null); setSaved('例文です。保存する場合は内容を確認してください。'); }}>例文を入れる</button><button className="secondary-button" type="button" disabled={busy || !input.trim()} onClick={saveNote}>{editingNoteId ? "更新する" : "保存する"}</button></div>
        </form>
        <div className="analysis-panel" aria-live="polite">
          <article className="analysis-card"><span>要約</span><p>{analysis.summary}</p></article>
          <article className="analysis-card"><span>重要ポイント</span><ul>{analysis.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul></article>
          <article className="analysis-card"><span>タスク</span><ul>{analysis.tasks.map((task) => <li key={`${task.task}-${task.deadline}`}>{task.task} <strong>（期限: {task.deadline}）</strong></li>)}</ul></article>
          <article className="analysis-card"><span>決定事項</span><p>{analysis.decision}</p></article>
        </div>
      </div>
      <div className="saved-panel"><div className="section-heading"><p className="section-kicker">Saved notes</p><h2>保存したノート</h2></div>{!loading && !error && savedNotes.length === 0 ? <div className="saved-empty">まだ保存したメモはありません。</div> : <div className="saved-list">{savedNotes.map((note) => <article className="saved-card" key={note.id}><div className="card-row"><span>{note.savedAt}</span><button className="delete-button" disabled={busy} onClick={() => deleteNote(note.id)}>削除</button></div><p>{note.input}</p><div className="input-actions"><button className="link-button" disabled={busy} onClick={() => { setInput(note.input); setSubmittedText(note.input); setEditingNoteId(note.id); }}>編集する</button></div></article>)}</div>}</div>
    </section>
  );
}
