"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeNote, type SavedNote } from "@/lib/note-analysis";

export default function SearchWorkspace() {
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => { fetch("/api/notes").then((res) => (res.ok ? res.json() : [])).then((items: SavedNote[]) => setNotes(items)).catch(() => undefined); }, []);
  const results = useMemo(() => notes.filter((note) => note.input.toLowerCase().includes(query.trim().toLowerCase())), [notes, query]);
  return <section className="section-block"><div className="section-heading"><p className="section-kicker">AI Search</p><h1>AI検索</h1><p>保存されたノートや、そこから抽出されたタスクを自然言語で検索します。</p></div><div className="search-toolbar"><label className="input-label" htmlFor="workspace-search">検索キーワード</label><input id="workspace-search" className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例: 会議 / 在庫 / SNS" /></div>{notes.length === 0 ? <div className="saved-empty">検索対象のノートはまだありません。</div> : results.length === 0 ? <div className="saved-empty">「{query}」に一致するノートはありません。</div> : <div className="search-list">{results.map((note) => { const analysis = analyzeNote(note.input); return <article className="search-card" key={note.id}><span>{note.savedAt}</span><p>{note.input}</p><p className="mini-summary">要約: {analysis.summary}</p></article>; })}</div>}</section>;
}
