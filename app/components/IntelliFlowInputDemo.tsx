"use client";

import { useEffect, useMemo, useState } from "react";

// helper to avoid calling Date.now() directly in the component render
const now = () => Date.now();

const sampleText = "来週までに在庫確認とSNS投稿を進める。会議では新メニューの告知方針を決める。";

const exampleTexts = [
  {
    title: "飲食店の業務",
    text: "来週までに在庫確認とSNS投稿を進める。会議では新メニューの告知方針を決める。",
  },
  {
    title: "中小企業の会議",
    text: "今週中に見積もりの整理と取引先への返信を対応する。次回会議では採用方針を決定する。",
  },
  {
    title: "小規模チームの指示",
    text: "明日までに資料作成と配信準備を実施する。必要なら担当者の役割を再確認する。",
  },
];


const deadlinePatterns = ["今日", "明日", "今週", "来週", "今月"];
const cleanupPatterns = ["進める", "対応する", "実施する", "決める", "確認する", "整理する", "準備する"];
const searchExamples = ["在庫", "会議", "SNS", "採用"];

type SavedNote = {
  id: string;
  input: string;
  savedAt: string;
};

type Analysis = {
  summary: string;
  keyPoints: string[];
  tasks: { task: string; deadline: string }[];
  decision: string;
};

function splitTasks(text: string) {
  const normalized = text
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/までに/g, "")
    .trim();

  const deadline = deadlinePatterns.find((pattern) => normalized.includes(pattern)) ?? "未設定";
  const cleaned = normalized.replace(new RegExp(`^(${deadlinePatterns.join("|")})\\s*`), "");
  const taskSource = cleaned
    .replace(new RegExp(cleanupPatterns.join("|"), "g"), "")
    .split(/[。\.\n]/g)
    .flatMap((sentence) => sentence.split(/と|、|及び|and|＆|なら/g))
    .map((part) => part.trim())
    .filter(Boolean);

  const tasks = Array.from(new Set(taskSource.length > 0 ? taskSource : ["内容を確認する"]));

  return tasks.map((task) => ({ task, deadline }));
}

function makeKeyPoints(text: string) {
  return text
    .split(/[。\.\n]/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function makeDecision(text: string) {
  const matched = text.match(/(決める|決定|方針|対応|進める|実施|確認)/);

  if (!matched) {
    return "会議内容を整理して次の行動を明確化します。";
  }

  return `入力文から「${matched[0]}」に関する意思決定を抽出します。`;
}

export function IntelliFlowInputDemo() {
  const [input, setInput] = useState(sampleText);
  const [submittedText, setSubmittedText] = useState(sampleText);
  const [searchQuery, setSearchQuery] = useState("会議");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<{
    notes: SavedNote[];
    timeoutId: number | null;
    expiresAt: number;
  } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const UNDO_MS = 7000;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/notes");
        if (!res.ok) return;
        const list = (await res.json()) as SavedNote[];
        setSavedNotes(list);
      } catch {
        // フェッチ失敗は無視
      }
    };

    load();
  }, []);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim();

    if (!query) {
      return savedNotes.slice(0, 3);
    }

    const normalizedQuery = query.toLowerCase();

    return savedNotes.filter((note) => note.input.toLowerCase().includes(normalizedQuery));
  }, [savedNotes, searchQuery]);

  const analysis = useMemo(() => {
    const source = submittedText.trim();

    if (!source) {
      return {
        summary: "文章を入力すると、要約・タスク・決定事項がここに表示されます。",
        keyPoints: ["会議メモや業務指示をそのまま貼り付けてください。"],
        tasks: [{ task: "入力を追加する", deadline: "未設定" }],
        decision: "まだ入力がありません。",
      };
    }

    return {
      summary: source.length > 64 ? `${source.slice(0, 64)}...` : source,
      keyPoints: makeKeyPoints(source),
      tasks: splitTasks(source),
      decision: makeDecision(source),
    };
  }, [submittedText]);

  const saveCurrentNote = () => {
    const source = submittedText.trim();

    if (!source) {
      return;
    }

    (async () => {
      try {
        const isEditing = editingNoteId !== null;
        const res = await fetch("/api/notes", {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEditing ? { id: editingNoteId, input: source } : { input: source }),
        });

        if (!res.ok) return;
        const created = await res.json();
        setSavedNotes((current) => {
          if (isEditing) {
            return [created, ...current.filter((note) => note.id !== editingNoteId)];
          }

          return [created, ...current.filter((note) => note.input !== source)];
        });
        setEditingNoteId(null);
      } catch {
        // 保存失敗は無視
      }
    })();
  };

  const openNoteForEdit = (note: SavedNote) => {
    setInput(note.input);
          const bulkDeleteSelected = () => {
            if (selectedIds.length === 0) return;
            scheduleDeletion(selectedIds);
          };
      
    setSubmittedText(note.input);
    setEditingNoteId(note.id);
  };

  const cancelSelection = () => setSelectedIds([]);

  const scheduleDeletion = (ids: string[]) => {
    const notesToDelete = savedNotes.filter((n) => ids.includes(n.id));
    if (notesToDelete.length === 0) return;

    // remove from UI immediately
    setSavedNotes((current) => current.filter((n) => !ids.includes(n.id)));

    // clear selection for removed ids
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));

    // setup pending delete with undo window
    const expiresAt = now() + UNDO_MS;
    const timeoutId = window.setTimeout(async () => {
      try {
        // finalize deletion on server
        await Promise.all(ids.map((id) => fetch('/api/notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })));
      } catch {
        // best-effort
      } finally {
        setPendingDeletes(null);
      }
    }, UNDO_MS);

    setPendingDeletes({ notes: notesToDelete, timeoutId, expiresAt });
  };

  useEffect(() => {
    if (!pendingDeletes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingSeconds(null);
      return;
    }

    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((pendingDeletes.expiresAt - now()) / 1000)));
    update();
    const id = window.setInterval(update, 250);
    return () => clearInterval(id);
  }, [pendingDeletes]);

  const undoDeletion = async () => {
    if (!pendingDeletes) return;
    // cancel timeout
    if (pendingDeletes.timeoutId) {
      clearTimeout(pendingDeletes.timeoutId);
    }
    // restore locally (server-side was not modified yet)
    setSavedNotes((current) => [...pendingDeletes.notes, ...current]);
    setPendingDeletes(null);
  };

  const analyzeText = (text: string): Analysis => {
    const source = text.trim();

    return {
      summary: source.length > 64 ? `${source.slice(0, 64)}...` : source,
      keyPoints: makeKeyPoints(source),
      tasks: splitTasks(source),
      decision: makeDecision(source),
    };
  };

  const deleteNote = (id: string) => {
    scheduleDeletion([id]);
  };

  const bulkDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    scheduleDeletion(selectedIds);
  };

  return (
    <section className="section-block" id="input-demo">
      <div className="section-heading">
        <p className="section-kicker">1. 入力例</p>
        <h2>まずは、現場でよくある文章をそのまま試す。</h2>
      </div>

      <div className="example-grid">
        {exampleTexts.map((example) => (
          <button
            className="example-card"
            key={example.title}
            type="button"
            onClick={() => {
              setInput(example.text);
              setSubmittedText(example.text);
            }}
          >
            <span>{example.title}</span>
            <strong>{example.text}</strong>
          </button>
        ))}
      </div>

      <div className="input-lab">
        <form
          className="input-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedText(input);
          }}
        >
          <label className="input-label" htmlFor="intelliflow-input">
            会議メモ・チャット・業務指示
          </label>
          {editingNoteId ? <p className="edit-hint">編集中: 保存するとこのメモを上書きします。</p> : null}
          <textarea
            id="intelliflow-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例: 来週までに在庫確認とSNS投稿を進める。会議では新メニューの告知方針を決める。"
            rows={8}
          />

          <div className="input-actions">
            <button className="primary-button" type="submit">
              解析する
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setInput(sampleText);
                setSubmittedText(sampleText);
                setEditingNoteId(null);
              }}
            >
              例文を入れる
            </button>
            {editingNoteId ? (
              <button className="secondary-button" type="button" onClick={() => setEditingNoteId(null)}>
                編集をやめる
              </button>
            ) : null}
            <button className="secondary-button" type="button" onClick={saveCurrentNote}>
              {editingNoteId ? "更新する" : "保存する"}
            </button>
          </div>
        </form>

        <div className="analysis-panel" aria-live="polite">
          <article className="analysis-card">
            <span>要約</span>
            <p>{analysis.summary}</p>
          </article>

          <article className="analysis-card">
            <span>重要ポイント</span>
            <ul>
              {analysis.keyPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>

          <article className="analysis-card">
            <span>タスク</span>
            <ul>
              {analysis.tasks.map((item) => (
                <li key={`${item.task}-${item.deadline}`}>
                  {item.task} <strong>（期限: {item.deadline}）</strong>
                </li>
              ))}
            </ul>
          </article>

          <article className="analysis-card">
            <span>決定事項</span>
            <p>{analysis.decision}</p>
          </article>
        </div>

        {selectedIds.length > 0 ? (
          <div className="bulk-toolbar">
            <button className="danger-button" type="button" onClick={bulkDeleteSelected}>
              一括削除 ({selectedIds.length})
            </button>
            <button className="secondary-button" type="button" onClick={cancelSelection}>
              選択解除
            </button>
          </div>
        ) : null}
      </div>

      <div className="search-panel">
        <div className="section-heading">
          <p className="section-kicker">2. AI検索</p>
          <h2>保存したメモから、必要なものだけを探す。</h2>
        </div>

        <div className="search-toolbar">
          <label className="input-label" htmlFor="intelliflow-search">
            検索キーワード
          </label>
          <input
            id="intelliflow-search"
            className="search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="例: 会議 / 在庫 / SNS"
          />
          <div className="search-examples">
            {searchExamples.map((example) => (
              <button
                key={example}
                type="button"
                className="search-chip"
                onClick={() => setSearchQuery(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {savedNotes.length === 0 ? (
          <div className="saved-empty">先にメモを保存すると、ここから検索できます。</div>
        ) : searchResults.length === 0 ? (
          <div className="saved-empty">「{searchQuery}」に一致する保存メモはありません。</div>
        ) : (
          <div className="search-list">
            {searchResults.map((note) => {
              const na = analyzeText(note.input);
              return (
                <article
                  className="search-card"
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openNoteForEdit(note)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openNoteForEdit(note);
                    }
                  }}
                >
                  <div className="card-row">
                    <span>{note.savedAt}</span>
                    <button
                      className="delete-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteNote(note.id);
                      }}
                      aria-label="削除"
                    >
                      削除
                    </button>
                  </div>
                  <p>{note.input}</p>
                  <div className="card-analysis">
                    <p className="mini-summary">要約: {na.summary}</p>
                    <ul className="mini-tasks">
                      {na.tasks.map((t) => (
                        <li key={`${note.id}-${t.task}`}>{t.task} <strong>（期限: {t.deadline}）</strong></li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="saved-panel">
        <div className="section-heading">
          <p className="section-kicker">3. 保存</p>
          <h2>解析結果を残して、あとから見返す。</h2>
        </div>
        {pendingDeletes ? (
          <div className="pending-banner">
              メモを削除しました。<button className="link-button" onClick={undoDeletion}>取り消す</button>（{remainingSeconds ?? 0}秒以内）
            </div>
        ) : null}

        {savedNotes.length === 0 ? (
          <div className="saved-empty">まだ保存したメモはありません。上のボタンから保存できます。</div>
        ) : (
          <div className="saved-list">
            {savedNotes.map((note) => (
              <article
                className="saved-card"
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => openNoteForEdit(note)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openNoteForEdit(note);
                  }
                }}
              >
                <div className="card-row">
                  <span>{note.savedAt}</span>
                  <button
                    className="delete-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteNote(note.id);
                    }}
                    aria-label="削除"
                  >
                    削除
                  </button>
                </div>
                <p>{note.input}</p>
                {editingNoteId === note.id ? <p className="edit-hint">編集中: このメモを編集して「更新する」で上書きできます。</p> : null}
                <div className="card-analysis">
                  {(() => {
                    const na = analyzeText(note.input);
                    return (
                      <>
                        <p className="mini-summary">要約: {na.summary}</p>
                        <ul className="mini-tasks">
                          {na.tasks.map((t) => (
                            <li key={`${note.id}-s-${t.task}`}>{t.task} <strong>（期限: {t.deadline}）</strong></li>
                          ))}
                        </ul>
                      </>
                    );
                  })()}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}