"use client";

import { useMemo, useState } from "react";

const sampleText = "来週までに在庫確認とSNS投稿を進める。会議では新メニューの告知方針を決める。";

const deadlinePatterns = ["今日", "明日", "今週", "来週", "今月"];

function splitTasks(text: string) {
  const normalized = text
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/までに/g, "")
    .trim();

  const deadline = deadlinePatterns.find((pattern) => normalized.includes(pattern)) ?? "未設定";
  const taskSource = normalized
    .replace(/^(今日|明日|今週|来週|今月)\s*/, "")
    .replace(/進める|対応する|実施する|決める|確認する/g, "")
    .split(/と|、|及び|and|＆/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const tasks = taskSource.length > 0 ? taskSource : ["内容を確認する"];

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
  const matched = text.match(/(決める|決定|方針|対応|進める|実施)/);

  if (!matched) {
    return "会議内容を整理して次の行動を明確化します。";
  }

  return `入力文から「${matched[0]}」に関する意思決定を抽出します。`;
}

export function IntelliFlowInputDemo() {
  const [input, setInput] = useState(sampleText);
  const [submittedText, setSubmittedText] = useState(sampleText);

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

  return (
    <section className="section-block" id="input-demo">
      <div className="section-heading">
        <p className="section-kicker">入力フォーム</p>
        <h2>文章を入れると、すぐに整理結果を返す。</h2>
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
    </section>
  );
}