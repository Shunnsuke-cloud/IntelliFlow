"use client";

import { useEffect, useMemo, useState } from "react";

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

const storageKey = "intelliflow-saved-notes";

const deadlinePatterns = ["今日", "明日", "今週", "来週", "今月"];
const cleanupPatterns = ["進める", "対応する", "実施する", "決める", "確認する", "整理する", "準備する"];

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
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const stored = window.localStorage.getItem(storageKey);

      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored) as SavedNote[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(savedNotes));
    } catch {
      // 保存に失敗しても画面の動作は継続する
    }
  }, [savedNotes]);

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

    const savedAt = new Date().toLocaleString("ja-JP");
    setSavedNotes((current) => [
      { id: `${savedAt}-${source.slice(0, 12)}`, input: source, savedAt },
      ...current.filter((note) => note.input !== source),
    ]);
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
              }}
            >
              例文を入れる
            </button>
            <button className="secondary-button" type="button" onClick={saveCurrentNote}>
              保存する
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
      </div>

      <div className="saved-panel">
        <div className="section-heading">
          <p className="section-kicker">3. 保存</p>
          <h2>解析結果を残して、あとから見返す。</h2>
        </div>
        {savedNotes.length === 0 ? (
          <div className="saved-empty">まだ保存したメモはありません。上のボタンから保存できます。</div>
        ) : (
          <div className="saved-list">
            {savedNotes.map((note) => (
              <article className="saved-card" key={note.id}>
                <span>{note.savedAt}</span>
                <p>{note.input}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}