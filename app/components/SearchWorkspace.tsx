"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeNote, type SavedNote } from "@/lib/note-analysis";

export default function SearchWorkspace() {
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); fetch('/api/notes', { signal: controller.signal }).then(async res => { if (!res.ok) throw new Error(); return res.json(); }).then((items: SavedNote[]) => setNotes(items)).catch(() => { if (!controller.signal.aborted) setError('ノートを読み込めませんでした。再読み込みしてください。'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  const results = useMemo(() => notes.filter((note) => note.input.toLowerCase().includes(query.trim().toLowerCase())), [notes, query]);
  return <section className="section-block"><div className="section-heading"><p className="section-kicker">LEGACY SEARCH</p><h1>旧ノート検索</h1><p>保存されたノート本文をキーワードで絞り込みます。ワークスペースの情報はFlow Mapから検索できます。</p></div><div className="search-toolbar"><label className="input-label" htmlFor="workspace-search">検索キーワード</label><input id="workspace-search" className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例: 会議 / 在庫 / SNS" /></div>{error ? <p role="alert" className="if-error">{error}</p> : loading ? <p role="status">読み込んでいます…</p> : notes.length === 0 ? <div className="saved-empty">検索対象のノートはまだありません。</div> : results.length === 0 ? <div className="saved-empty">「{query}」に一致するノートはありません。</div> : <div className="search-list">{results.map((note) => { const analysis = analyzeNote(note.input); return <article className="search-card" key={note.id}><span>{note.savedAt}</span><p>{note.input}</p><p className="mini-summary">要約: {analysis.summary}</p></article>; })}</div>}</section>;
}
