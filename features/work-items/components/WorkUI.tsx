"use client";
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Field, Modal } from '@/components/ui/controls';
import { canManage, type WorkspaceRole } from '@/lib/auth/policy';
import type { WikiSummary } from '@/features/wiki/types';
import {
  issueStatuses, projectStatuses, priorities, progress, issueStatusLabel,
  type Issue, type Project, type WorkKind, type Person, type Options, type Listing, type Detail, type ItemComment, type WorkEvent,
} from '../types';

type Item = Issue | Project;
type Saved = { id: string; version: number };
function useCommand(workspaceId: string) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [pending, startTransition] = useTransition();
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function run(body: Record<string, unknown>): Promise<Saved | null> {
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/work-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const value = await res.json() as Saved & { error?: string };
      if (!res.ok) throw new Error(value.error ?? '保存できませんでした。');
      setMessage('保存しました。'); startTransition(() => router.refresh()); return value;
    } catch (err) { setError(err instanceof Error ? err.message : '接続できませんでした。'); return null; }
    finally { setBusy(false); }
  }
  return { run, busy: busy || pending, error, message };
}
function Feedback({ error, message }: { error: string; message?: string }) {
  return <>{error && <p className="if-error" role="alert">{error} <Button type="button" onClick={() => window.location.reload()}>最新の内容を読み込む</Button></p>}{message && <p role="status" className="work-notice">{message}</p>}</>;
}
function personName(people: Person[], id: string | null) { return id ? people.find(p => p.user_id === id)?.display_name ?? '脱退済みメンバー' : '未割り当て'; }
function dateLabel(value: string | null) { return value ? value.replaceAll('-', '/') : '未設定'; }
function Status({ item, kind }: { item: Item; kind: WorkKind }) {
  const label = kind === 'issue' ? issueStatusLabel((item as Issue).status) : projectStatuses[(item as Project).status];
  return <span className={`work-status status-${item.status}`}>{label}</span>;
}
function Labels({ labels }: { labels: string[] }) { return <span className="work-labels">{labels.map(label => <span key={label}>{label}</span>)}</span>; }
function Progress({ project }: { project: Project }) {
  return <div className="work-progress"><div><span>{project.completed_count} / {project.issue_count} 課題完了</span><strong>{progress(project)}%</strong></div><progress value={project.completed_count} max={project.issue_count || 1} aria-label="課題の完了率" />{project.issue_count === 0 && <small>関連する課題はまだありません。</small>}</div>;
}
export function WorkEditor({ kind, workspaceId, people, options, item, defaultProject, onClose }: {
  kind: WorkKind; workspaceId: string; people: Person[]; options: Options; item?: Item; defaultProject?: string; onClose: () => void;
}) {
  const router = useRouter(); const mutation = useCommand(workspaceId);
  const [members, setMembers] = useState<string[]>(kind === 'project' && item ? (item as Project).member_ids : []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const common = { operation: `${kind}_${item ? 'update' : 'create'}`, id: item?.id, expected_version: item?.version, title: String(form.get('title')), description: String(form.get('description')), status: String(form.get('status')), due_on: form.get('due_on') };
    const fields = kind === 'issue' ? { priority: form.get('priority'), assignee_id: form.get('assignee_id'), project_id: form.get('project_id'), labels: String(form.get('labels')).split(/[,、\n]/).map(s => s.trim()).filter(Boolean) } : { start_on: form.get('start_on'), member_ids: members };
    const saved = await mutation.run({ ...common, ...fields });
    if (saved) { onClose(); if (!item) router.push(`/app/w/${workspaceId}/${kind === 'issue' ? 'issues' : 'projects'}/${saved.id}`); }
  }
  const issue = kind === 'issue' ? item as Issue | undefined : undefined;
  return <Modal title={`${kind === 'issue' ? 'Issue（課題）' : 'プロジェクト'}を${item ? '編集' : '作成'}`} onClose={() => { if (!mutation.busy) onClose(); }}>
    <form onSubmit={submit} className="work-editor">
      <Field label={kind === 'issue' ? 'タイトル' : 'プロジェクト名'} name="title" required maxLength={200} defaultValue={item?.title} />
      <label className="if-field"><span>説明</span><textarea name="description" rows={5} maxLength={10000} defaultValue={item?.description} placeholder="目的や進め方など、次の人が分かるように記録しましょう。" /></label>
      <div className="work-form-grid"><label className="if-field"><span>ステータス</span><select name="status" defaultValue={item?.status === 'blocked' ? 'review' : item?.status ?? (kind === 'issue' ? 'open' : 'planned')}>{Object.entries(kind === 'issue' ? issueStatuses : projectStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {kind === 'project' && <Field label="開始日" type="date" name="start_on" defaultValue={(item as Project | undefined)?.start_on ?? ''} />}
        <Field label={kind === 'issue' ? '期限' : '終了日'} type="date" name="due_on" defaultValue={item?.due_on ?? ''} />
      </div>
      {kind === 'issue' ? <>
        <div className="work-form-grid"><label className="if-field"><span>担当者</span><select name="assignee_id" defaultValue={issue?.assignee_id ?? ''}><option value="">未割り当て</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}{issue?.assignee_id && !people.some(p => p.user_id === issue.assignee_id) && <option value={issue.assignee_id}>脱退済み（再割り当てしてください）</option>}</select></label>
          <label className="if-field"><span>優先度</span><select name="priority" defaultValue={issue?.priority ?? 'normal'}>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        <label className="if-field"><span>関連プロジェクト</span><select name="project_id" defaultValue={issue?.project_id ?? defaultProject ?? ''}><option value="">プロジェクトなし</option>{options.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}{issue?.project_id && !options.projects.some(p => p.id === issue.project_id) && <option value={issue.project_id}>削除済みのプロジェクト</option>}</select></label>
        <Field label="ラベル（カンマ区切り・10個まで）" name="labels" maxLength={310} defaultValue={issue?.labels.join(', ')} placeholder="例：広報, 会議, 要相談" />
      </> : <fieldset className="work-member-picker"><legend>プロジェクトメンバー</legend>{people.map(p => <label key={p.user_id}><input type="checkbox" checked={members.includes(p.user_id)} onChange={e => setMembers(current => e.target.checked ? [...current, p.user_id] : current.filter(id => id !== p.user_id))} />{p.display_name}</label>)}{members.filter(id => !people.some(p => p.user_id === id)).map(id => <label key={id}><input type="checkbox" checked onChange={() => setMembers(current => current.filter(value => value !== id))} />脱退済みメンバー（選択を外してください）</label>)}</fieldset>}
      <Feedback error={mutation.error} /><div className="work-actions"><Button disabled={mutation.busy}>{mutation.busy ? '保存中…' : '保存する'}</Button><Button type="button" disabled={mutation.busy} onClick={onClose}>キャンセル</Button></div>
    </form>
  </Modal>;
}
export function WorkFilters({ kind, options, people, values }: { kind: WorkKind; options: Options; people: Person[]; values: Record<string, string> }) {
  const router = useRouter(); const path = usePathname();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); const params = new URLSearchParams();
    data.forEach((value, key) => { if (value) params.set(key, String(value)); });
    if (values.view) params.set('view', values.view); router.push(`${path}?${params}`);
  }
  return <form key={JSON.stringify(values)} onSubmit={submit} className="work-filters" aria-label="検索・絞り込み">
    <label><span>検索</span><input type="search" name="q" maxLength={200} placeholder={kind === 'issue' ? 'タイトル・説明・ISSUE番号' : 'プロジェクト名・説明'} defaultValue={values.q} /></label>
    <label><span>ステータス</span><select name="status" defaultValue={values.status ?? ''}><option value="">すべて</option>{Object.entries(kind === 'issue' ? { ...issueStatuses, blocked: '保留（旧データ）' } : projectStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {kind === 'issue' ? <>
      <label><span>担当者</span><select name="assignee" defaultValue={values.assignee ?? ''}><option value="">すべて</option><option value="none">未割り当て</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>
      <label><span>プロジェクト</span><select name="project" defaultValue={values.project ?? ''}><option value="">すべて</option><option value="none">未所属</option>{options.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <label><span>優先度</span><select name="priority" defaultValue={values.priority ?? ''}><option value="">すべて</option>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>ラベル</span><select name="label" defaultValue={values.label ?? ''}><option value="">すべて</option>{options.labels.map(label => <option key={label}>{label}</option>)}</select></label>
      <label><span>期限がこの日まで</span><input type="date" name="due_before" defaultValue={values.due_before} /></label>
    </> : <label><span>メンバー</span><select name="member" defaultValue={values.member ?? ''}><option value="">すべて</option>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>}
    <label><span>並び順</span><select name="sort" defaultValue={values.sort ?? 'updated'}><option value="updated">更新が新しい順</option><option value="created">作成が新しい順</option><option value="title">名前順</option><option value="due">期限が近い順</option>{kind === 'issue' && <><option value="priority">優先度が高い順</option><option value="number">番号順</option></>}</select></label>
    <label><span>表示対象</span><select name="archived" defaultValue={values.archived ?? 'false'}><option value="false">使用中</option><option value="true">削除済み</option></select></label>
    <Button>適用</Button><Button type="button" onClick={() => router.push(path)}>リセット</Button>
  </form>;
}
export function WorkList({ kind, workspaceId, listing, people, options, role, values }: {
  kind: WorkKind; workspaceId: string; listing: Listing<Item>; people: Person[]; options: Options; role: WorkspaceRole; values: Record<string, string>;
}) {
  const [creating, setCreating] = useState(false); const router = useRouter(); const path = usePathname(); const writable = role !== 'viewer'; const mutation = useCommand(workspaceId);
  const kanban = kind === 'project' && values.view === 'kanban';
  function navigate(extra: Record<string, string>) { const params = new URLSearchParams({ ...values, ...extra }); router.push(`${path}?${params}`); }
  function card(item: Item): ReactNode {
    if (kind === 'project' && kanban) {
      const project = item as Project;
      return <article className="work-card" key={item.id}><Link className="work-card-link" href={`/app/w/${workspaceId}/projects/${item.id}`}><div className="work-card-heading"><h2>{item.title}</h2><Status item={item} kind="project" /></div><p className="work-description-preview">{item.description || '説明はまだありません。'}</p><Progress project={project} /></Link>{writable && !item.archived_at && <select aria-label={`${item.title}のステータス`} value={project.status} disabled={mutation.busy} onChange={e => mutation.run({ ...project, operation: 'project_update', expected_version: project.version, status: e.target.value })}>{Object.entries(projectStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}</article>;
    }
    return <Link key={item.id} href={`/app/w/${workspaceId}/${kind === 'issue' ? 'issues' : 'projects'}/${item.id}`} className={`work-card ${kind === 'issue' ? 'work-issue-row' : ''}`}>
      <div className="work-card-heading"><div>{kind === 'issue' && <span className="work-code">{(item as Issue).code}</span>}<h2>{item.title}</h2></div><Status item={item} kind={kind} /></div>
      {kind === 'issue' ? <div className="work-row-meta"><Labels labels={(item as Issue).labels} /><span>担当：{personName(people, (item as Issue).assignee_id)}</span><span>優先度：{priorities[(item as Issue).priority]}</span><span>期限：{dateLabel(item.due_on)}</span></div> : <><p className="work-description-preview">{item.description || '説明はまだありません。'}</p><Progress project={item as Project} /><p className="work-subtle">{(item as Project).member_ids.length}人のメンバー · {dateLabel((item as Project).start_on)} — {dateLabel(item.due_on)}</p></>}
    </Link>;
  }
  return <>
    <header className="work-page-heading"><div><p className="if-kicker">{kind === 'issue' ? 'ISSUES' : 'PROJECTS'}</p><h1>{kind === 'issue' ? 'Issue（課題）' : 'プロジェクト'}</h1><p>{kind === 'issue' ? 'やること・担当・期限を整理して、チームで進めましょう。' : '課題をまとめ、実際の進捗をチームで共有しましょう。'}</p></div>{writable && <Button onClick={() => setCreating(true)}>＋ {kind === 'issue' ? '課題を作成' : 'プロジェクトを作成'}</Button>}</header>
    <WorkFilters kind={kind} people={people} options={options} values={values} />
    <Feedback error={mutation.error} message={mutation.message} />
    <div className="work-list-toolbar"><span>{listing.total}件{listing.items.length > 0 && listing.total > listing.items.length && `中 ${listing.offset + 1}〜${listing.offset + listing.items.length}件`}{kanban && ' · 現在のページをカンバン表示'}</span>{kind === 'project' && <div className="work-view-switch"><Button aria-pressed={!kanban} onClick={() => navigate({ view: 'list' })}>一覧</Button><Button aria-pressed={kanban} onClick={() => navigate({ view: 'kanban' })}>カンバン</Button></div>}</div>
    {!listing.items.length ? <section className="if-state"><h2>{values.archived === 'true' ? '削除済みの情報はありません' : '該当する情報はありません'}</h2><p>検索条件を変更するか、新しく作成してください。</p></section> : kanban ? <div className="work-kanban">{Object.entries(projectStatuses).map(([status, label]) => <section className="work-column" key={status}><h2>{label}<span>{listing.items.filter(i => i.status === status).length}</span></h2>{listing.items.filter(i => i.status === status).map(card)}</section>)}</div> : <div className={kind === 'issue' ? 'work-issue-list' : 'work-project-grid'}>{listing.items.map(card)}</div>}
    {(listing.total > listing.limit || listing.offset > 0) && <div className="work-actions"><Button disabled={listing.offset === 0} onClick={() => navigate({ offset: String(Math.max(0, listing.offset - listing.limit)) })}>前へ</Button><span>{Math.floor(listing.offset / listing.limit) + 1}ページ</span><Button disabled={listing.offset + listing.limit >= listing.total} onClick={() => navigate({ offset: String(listing.offset + listing.limit) })}>次へ</Button></div>}
    {creating && <WorkEditor kind={kind} workspaceId={workspaceId} people={people} options={options} onClose={() => setCreating(false)} />}
  </>;
}

const eventLabels: Record<string, string> = { issue_create: '課題を作成', issue_update: '課題を更新', project_create: 'プロジェクトを作成', project_update: 'プロジェクトを更新', archive: '削除（アーカイブ）', restore: '復元', comment_create: 'コメントを追加', comment_update: 'コメントを編集', comment_archive: 'コメントを削除', link: '関連課題を追加', unlink: '関連課題を解除' };
const fieldLabels: Record<string, string> = { title: 'タイトル', description: '説明', status: 'ステータス', priority: '優先度', assignee_id: '担当者', project_id: 'プロジェクト', due_on: '期限／終了日', start_on: '開始日', labels: 'ラベル', member_ids: 'メンバー', archived_at: '削除状態' };
function HistoryChanges({ event, people, options, root }: { event: WorkEvent; people: Person[]; options: Options; root: string }) {
  function readable(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '未設定';
    if (field === 'status') return ({ ...issueStatuses, ...projectStatuses, blocked: '保留（旧データ）' } as Record<string, string>)[String(value)] ?? String(value);
    if (field === 'priority') return priorities[value as keyof typeof priorities] ?? String(value);
    if (field === 'assignee_id') return personName(people, String(value));
    if (field === 'project_id') return options.projects.find(p => p.id === value)?.title ?? '削除済みのプロジェクト';
    if (field === 'member_ids' && Array.isArray(value)) return value.map(id => personName(people, String(id))).join('、') || 'なし';
    if (Array.isArray(value)) return value.join('、') || 'なし';
    if (field === 'archived_at') return '削除済み';
    return String(value);
  }
  const related = event.after_data?.related_id;
  if (typeof related === 'string') return <p><Link href={`${root}/issues/${related}`}>関連する課題を開く →</Link></p>;
  if (event.action.startsWith('comment_')) {
    const before = event.before_data?.comment as { body?: string } | undefined;
    const after = event.after_data?.comment as { body?: string } | undefined;
    return <details><summary>コメントの内容を見る</summary>{before?.body && <p className="work-body">変更前：{before.body}</p>}{event.action !== 'comment_archive' && after?.body && <p className="work-body">{before ? '変更後' : '内容'}：{after.body}</p>}</details>;
  }
  const changed = Object.entries(fieldLabels).filter(([field]) => JSON.stringify(event.before_data?.[field]) !== JSON.stringify(event.after_data?.[field]));
  return changed.length ? <details><summary>{changed.map(([, label]) => label).join('・')}</summary><dl className="work-history-changes">{changed.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{event.before_data && <><span>{readable(field, event.before_data[field])}</span><b aria-label="から"> → </b></>}{readable(field, event.after_data?.[field])}</dd></div>)}</dl></details> : null;
}
export function WorkDetail({ kind, detail, workspaceId, people, options, role, userId, relatedIssues, relatedWiki, wikiError }: {
  kind: WorkKind; detail: Detail<Item>; workspaceId: string; people: Person[]; options: Options; role: WorkspaceRole; userId: string; relatedIssues?: Listing<Issue>; relatedWiki?: WikiSummary[]; wikiError?: boolean;
}) {
  const item = detail.item; const mutation = useCommand(workspaceId); const router = useRouter();
  const [editing, setEditing] = useState(false); const [deleting, setDeleting] = useState(false); const [addingIssue, setAddingIssue] = useState(false);
  const [comment, setComment] = useState(''); const [editingComment, setEditingComment] = useState<ItemComment | null>(null);
  const [relatedId, setRelatedId] = useState(''); const [found, setFound] = useState<Issue[]>([]); const [search, setSearch] = useState(''); const [searchError, setSearchError] = useState(''); const [searchBusy, setSearchBusy] = useState(false);
  const [board, setBoard] = useState(false); const writable = role !== 'viewer' && !item.archived_at;
  const canDelete = role !== 'viewer' && (canManage(role) || item.created_by === userId);
  async function run(operation: string, extra: Record<string, unknown> = {}) { return mutation.run({ operation, id: item.id, expected_version: item.version, ...extra }); }
  async function find(e: FormEvent) {
    e.preventDefault(); setSearchError(''); setSearchBusy(true);
    try {
      const params = new URLSearchParams({ collection: 'issues', q: search, limit: '20' });
      const res = await fetch(`/api/workspaces/${workspaceId}/work-items?${params}`); const value = await res.json() as Listing<Issue> & { error?: string };
      if (!res.ok) throw new Error(value.error ?? '検索できませんでした。');
      setFound(value.items.filter(i => i.id !== item.id && !detail.relations.some(r => r.id === i.id))); setRelatedId('');
    } catch (err) { setSearchError(err instanceof Error ? err.message : '検索できませんでした。'); } finally { setSearchBusy(false); }
  }
  async function changeIssue(issue: Issue, status: string) {
    await mutation.run({ ...issue, operation: 'issue_update', expected_version: issue.version, status });
  }
  const root = `/app/w/${workspaceId}`;
  return <>
    <Link className="work-back" href={`${root}/${kind === 'issue' ? 'issues' : 'projects'}`}>← {kind === 'issue' ? '課題一覧' : 'プロジェクト一覧'}</Link>
    <header className="work-page-heading"><div><p className="if-kicker">{kind === 'issue' ? (item as Issue).code : 'PROJECT'}</p><h1>{item.title}</h1><Status kind={kind} item={item} />{item.archived_at && <span className="if-badge">削除済み</span>}</div><div className="work-actions">{writable && <Button onClick={() => setEditing(true)}>編集する</Button>}{canDelete && <Button disabled={mutation.busy} onClick={() => item.archived_at ? run('restore') : setDeleting(true)}>{item.archived_at ? '復元する' : '削除する'}</Button>}</div></header>
    <Feedback error={mutation.error} message={mutation.message} />
    <div className="work-detail-grid"><section className="work-panel"><h2>説明</h2><p className="work-body">{item.description || '説明はまだありません。'}</p>{kind === 'project' && <Progress project={item as Project} />}</section>
      <aside className="work-panel work-properties"><h2>詳細</h2><dl>
        {kind === 'issue' ? <><dt>担当者</dt><dd>{personName(people, (item as Issue).assignee_id)}</dd><dt>優先度</dt><dd>{priorities[(item as Issue).priority]}</dd><dt>プロジェクト</dt><dd>{(item as Issue).project_id ? <Link href={`${root}/projects/${(item as Issue).project_id}`}>{options.projects.find(p => p.id === (item as Issue).project_id)?.title ?? '削除済みのプロジェクト'}</Link> : '未所属'}</dd><dt>ラベル</dt><dd>{(item as Issue).labels.length ? <Labels labels={(item as Issue).labels} /> : 'なし'}</dd></> : <><dt>開始日</dt><dd>{dateLabel((item as Project).start_on)}</dd><dt>メンバー</dt><dd>{(item as Project).member_ids.length ? (item as Project).member_ids.map(id => personName(people, id)).join('、') : '未設定'}</dd></>}
        <dt>{kind === 'issue' ? '期限' : '終了日'}</dt><dd>{dateLabel(item.due_on)}</dd><dt>作成者</dt><dd>{personName(people, item.created_by)}</dd><dt>最終更新</dt><dd><time dateTime={item.updated_at}>{new Date(item.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（日本時間）</time></dd>
      </dl></aside>
    </div>
    {kind === 'issue' ? <div className="work-detail-grid"><section className="work-panel"><h2>コメント</h2>{detail.comments.length ? <ul className="work-comments">{detail.comments.map(c => <li key={c.id}><div className="work-comment-top"><strong>{personName(people, c.author_id)}</strong><time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</time></div><p className="work-body">{c.body}</p>{writable && <div className="work-actions">{c.author_id === userId && <Button onClick={() => setEditingComment(c)}>編集</Button>}{(c.author_id === userId || canManage(role)) && <Button disabled={mutation.busy} onClick={() => run('comment_archive', { comment_id: c.id, comment_version: c.version })}>削除</Button>}</div>}</li>)}</ul> : <p className="work-subtle">コメントはまだありません。</p>}
      {writable && <form onSubmit={async e => { e.preventDefault(); if (await run('comment_create', { body: comment })) setComment(''); }}><label className="if-field"><span>コメントを追加</span><textarea rows={3} maxLength={5000} required value={comment} onChange={e => setComment(e.target.value)} /></label><Button disabled={mutation.busy || !comment.trim()}>投稿する</Button></form>}</section>
      <section className="work-panel"><h2>関連するIssue（課題）</h2>{detail.relations.length ? <ul className="work-relations">{detail.relations.map(r => <li key={r.id}><Link href={`${root}/issues/${r.id}`}><span className="work-code">{r.code}</span>{r.title}</Link>{writable && <Button disabled={mutation.busy} onClick={() => run('unlink', { other_id: r.id })}>解除</Button>}</li>)}</ul> : <p className="work-subtle">関連する課題はまだありません。</p>}
      {writable && <><form onSubmit={find}><Field label="関連付ける課題を検索" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} /><Button disabled={searchBusy}>{searchBusy ? '検索中…' : '候補を検索'}</Button></form><Feedback error={searchError} />{found.length ? <form className="work-link-picker" onSubmit={async e => { e.preventDefault(); if (await run('link', { other_id: relatedId })) { setFound([]); setRelatedId(''); } }}><select aria-label="関連付ける課題" required value={relatedId} onChange={e => setRelatedId(e.target.value)}><option value="">課題を選択してください</option>{found.map(i => <option key={i.id} value={i.id}>{i.code} {i.title}</option>)}</select><Button disabled={mutation.busy}>関連付ける</Button></form> : search && !searchBusy && <p className="work-subtle">候補がなければ検索語を変えてください。</p>}</>}
      </section></div> : <section className="work-panel"><div className="work-list-toolbar"><h2>関連するIssue（課題）</h2><div className="work-actions"><Button aria-pressed={!board} onClick={() => setBoard(false)}>一覧</Button><Button aria-pressed={board} onClick={() => setBoard(true)}>カンバン</Button>{writable && <Button onClick={() => setAddingIssue(true)}>＋ 課題を追加</Button>}</div></div>
        {relatedIssues?.items.length ? board ? <div className="work-kanban issue-board">{Object.entries(issueStatuses).map(([status, label]) => <section className="work-column" key={status}><h3>{label}</h3>{relatedIssues.items.filter(i => i.status === status || (status === 'review' && i.status === 'blocked')).map(i => <article className="work-card" key={i.id}><Link href={`${root}/issues/${i.id}`}><span className="work-code">{i.code}</span><h3>{i.title}</h3></Link><Labels labels={i.labels} />{writable && <select aria-label={`${i.code}のステータス`} value={i.status === 'blocked' ? 'review' : i.status} disabled={mutation.busy} onChange={e => changeIssue(i, e.target.value)}>{Object.entries(issueStatuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>}</article>)}</section>)}</div> : <ul className="work-relations">{relatedIssues.items.map(i => <li key={i.id}><Link href={`${root}/issues/${i.id}`}><span className="work-code">{i.code}</span>{i.title}</Link><Status item={i} kind="issue" /></li>)}</ul> : <p>関連する課題はまだありません。</p>}
        {relatedIssues && relatedIssues.total > relatedIssues.items.length && <p>先頭{relatedIssues.items.length}件を表示しています。<Link href={`${root}/issues?project=${item.id}`}>すべての関連課題を見る（{relatedIssues.total}件）</Link></p>}
      </section>}
    <section className="work-panel"><h2>更新履歴</h2><p className="work-subtle">最近の100件を表示。削除後も履歴は残ります。</p>{detail.events.length ? <ol className="work-history">{detail.events.map(event => <li key={event.id}><div><strong>{eventLabels[event.action] ?? event.action}</strong><span>{personName(people, event.actor_id)} · {new Date(event.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span></div><HistoryChanges event={event} people={people} options={options} root={root} /></li>)}</ol> : <p>更新履歴はまだありません。</p>}</section>
    <section className="work-panel"><h2>関連するWiki</h2>{wikiError ? <p role="alert">関連Wikiを取得できませんでした。接続・Wiki設定を確認してください。</p> : relatedWiki?.length ? <ul className="work-relations">{relatedWiki.map(page => <li key={page.id}><Link href={`${root}/wiki/${page.id}`}>{page.title}</Link><span className="if-badge">{page.category}</span></li>)}</ul> : <p>関連するWikiはまだありません。</p>}</section>
    {editing && <WorkEditor kind={kind} workspaceId={workspaceId} people={people} options={options} item={item} onClose={() => setEditing(false)} />}
    {addingIssue && <WorkEditor kind="issue" workspaceId={workspaceId} people={people} options={options} defaultProject={item.id} onClose={() => setAddingIssue(false)} />}
    {deleting && <Modal title="削除しますか？" onClose={() => { if (!mutation.busy) setDeleting(false); }}><p>「{item.title}」を通常の一覧から外します。履歴{kind === 'project' ? 'と関連する課題' : 'とコメント'}は残り、削除済み一覧から復元できます。</p><Feedback error={mutation.error} /><Button disabled={mutation.busy} onClick={async () => { if (await run('archive')) { setDeleting(false); router.push(`${root}/${kind === 'issue' ? 'issues' : 'projects'}`); } }}>{mutation.busy ? '削除中…' : '削除する'}</Button></Modal>}
    {editingComment && <Modal title="コメントを編集" onClose={() => { if (!mutation.busy) setEditingComment(null); }}><form onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (await run('comment_update', { body: form.get('body'), comment_id: editingComment.id, comment_version: editingComment.version })) setEditingComment(null); }}><label className="if-field"><span>コメント</span><textarea name="body" required maxLength={5000} rows={5} defaultValue={editingComment.body} /></label><Feedback error={mutation.error} /><Button disabled={mutation.busy}>保存する</Button></form></Modal>}
  </>;
}
