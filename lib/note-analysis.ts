export type SavedNote = {
  id: string;
  input: string;
  savedAt: string;
};

export type NoteAnalysis = {
  summary: string;
  keyPoints: string[];
  tasks: { task: string; deadline: string }[];
  decision: string;
};

const deadlinePatterns = ["今日", "明日", "今週", "来週", "今月"];
const cleanupPatterns = ["進める", "対応する", "実施する", "決める", "確認する", "整理する", "準備する"];

function splitTasks(text: string) {
  const normalized = text.replace(/\n/g, " ").replace(/\s+/g, " ").replace(/までに/g, "").trim();
  const deadline = deadlinePatterns.find((pattern) => normalized.includes(pattern)) ?? "未設定";
  const cleaned = normalized.replace(new RegExp(`^(${deadlinePatterns.join("|")})\\s*`), "");
  const taskSource = cleaned
    .replace(new RegExp(cleanupPatterns.join("|"), "g"), "")
    .split(/[。\.\n]/g)
    .flatMap((sentence) => sentence.split(/と|、|及び|and|＆|なら/g))
    .map((part) => part.trim())
    .filter(Boolean);

  return Array.from(new Set(taskSource.length ? taskSource : ["内容を確認する"])).map((task) => ({ task, deadline }));
}

export function analyzeNote(text: string): NoteAnalysis {
  const source = text.trim();

  if (!source) {
    return {
      summary: "文章を入力すると、要約・タスク・決定事項がここに表示されます。",
      keyPoints: ["会議メモや業務指示をそのまま貼り付けてください。"],
      tasks: [{ task: "入力を追加する", deadline: "未設定" }],
      decision: "まだ入力がありません。",
    };
  }

  const matched = source.match(/(決める|決定|方針|対応|進める|実施|確認)/);
  return {
    summary: source.length > 64 ? `${source.slice(0, 64)}...` : source,
    keyPoints: source.split(/[。\.\n]/g).map((line) => line.trim()).filter(Boolean).slice(0, 3),
    tasks: splitTasks(source),
    decision: matched ? `入力文から「${matched[0]}」に関する意思決定を抽出します。` : "会議内容を整理して次の行動を明確化します。",
  };
}
