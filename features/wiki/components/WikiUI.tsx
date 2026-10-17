"use client";
import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Button, Field, Modal } from '@/components/ui/controls';
import { canManage, type WorkspaceRole } from '@/lib/auth/policy';
import { emptyDocument, validateDocument } from '../document';
import type { WikiDetail, WikiListing, WikiOptions, WikiRelation, WikiSummary } from '../types';
import type { Person } from '@/features/work-items/types';
import WikiEditor from './WikiEditor';
import WikiBody from './WikiBody';

export function WikiTree({ workspaceId, pages, currentId }: { workspaceId: string; pages: WikiSummary[]; currentId?: string }) {
  const known = new Set(pages.map(p => p.id));
  function branch(parent: string | null, visited: Set<string>): React.ReactNode {
    const children = pages.filter(p => (p.parent_id && known.has(p.parent_id) ? p.parent_id : null) === parent && !visited.has(p.id));
    return children.length ? <ul>{children.map(page => <li key={page.id}><Link aria-current={page.id === currentId ? 'page' : undefined} href={`/app/w/${workspaceId}/wiki/${page.id}`}>{page.title}{page.status === 'draft' && <small>下書き</small>}</Link>{branch(page.id, new Set([...visited, page.id]))}</li>)}</ul> : null;
  }
  return <aside className="wiki-tree"><h2>ページ階層</h2>{pages.length ? branch(null, new Set()) : <p>ページはまだありません。</p>}</aside>;
}
export function WikiList({ workspaceId, listing, options, role, values }: { workspaceId: string; listing: WikiListing; options: WikiOptions; role: WorkspaceRole; values: Record<string, string> }) {
  const router = useRouter(); const path = usePathname();
  function search(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const query = new URLSearchParams(); new FormData(e.currentTarget).forEach((value, key) => { if (value) query.set(key, String(value)); }); router.push(`${path}?${query}`); }
  function page(offset: number) { router.push(`${path}?${new URLSearchParams({ ...values, offset: String(offset) })}`); }
  return <><header className="work-page-heading"><div><p className="if-kicker">WIKI</p><h1>資料・手順を、次の人へ。</h1><p>マニュアル・議事録・ノウハウ・FAQをまとめて探せます。</p></div>{role !== 'viewer' && <Link className="if-button" href={`${path}/new`}>＋ ページを作成</Link>}</header>
    <div className="wiki-layout"><WikiTree workspaceId={workspaceId} pages={options.pages} /><div className="wiki-main">
      <form className="work-filters" key={JSON.stringify(values)} onSubmit={search}><label><span>キーワード検索</span><input name="q" type="search" maxLength={200} defaultValue={values.q} placeholder="タイトル・本文で検索" /></label><label><span>カテゴリ</span><select name="category" defaultValue={values.category ?? ''}><option value="">すべて</option>{options.categories.map(category => <option key={category}>{category}</option>)}</select></label><label><span>公開状態</span><select name="status" defaultValue={values.status ?? ''}><option value="">すべて</option><option value="published">共有中</option><option value="draft">下書き</option></select></label><label><span>表示対象</span><select name="archived" defaultValue={values.archived ?? 'false'}><option value="false">使用中</option><option value="true">削除済み</option></select></label><Button>検索</Button><Button type="button" onClick={() => router.push(path)}>リセット</Button></form>
      <p className="work-subtle">{listing.total}件 · 更新が新しい順</p><div className="wiki-page-list">{listing.items.map(page => <Link className="work-card" key={page.id} href={`${path}/${page.id}`}><span className="if-badge">{page.category}</span><h2>{page.title}</h2><p className="work-subtle">{page.status === 'draft' ? '下書き' : '共有中'} · 第{page.current_revision}版 · {new Date(page.updated_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}{page.archived_at && ' · 削除済み'}</p></Link>)}</div>
      {!listing.items.length && <section className="if-state"><h2>該当するページはありません</h2><p>検索条件を変えるか、新しいページを作成してください。</p></section>}
      {(listing.total > listing.limit || listing.offset > 0) && <div className="work-actions"><Button disabled={!listing.offset} onClick={() => page(Math.max(0, listing.offset - listing.limit))}>前へ</Button><span>{Math.floor(listing.offset / listing.limit) + 1}ページ</span><Button disabled={listing.offset + listing.limit >= listing.total} onClick={() => page(listing.offset + listing.limit)}>次へ</Button></div>}
    </div></div>
  </>;
}
export function WikiForm({ workspaceId, detail, options, role, userId }: { workspaceId: string; detail?: WikiDetail; options: WikiOptions; role: WorkspaceRole; userId: string }) {
  const router = useRouter(); const page = detail?.page; const [doc, setDoc] = useState<unknown>(page?.body_doc ?? emptyDocument);
  const [selected, setSelected] = useState<WikiRelation[]>(detail?.relations ?? []); const [query, setQuery] = useState(''); const [targets, setTargets] = useState<WikiRelation[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false); const [finding, setFinding] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const blockedParents = new Set<string>(page ? [page.id] : []); let changed = true;
  while (changed) { changed = false; for (const p of options.pages) if (p.parent_id && blockedParents.has(p.parent_id) && !blockedParents.has(p.id)) { blockedParents.add(p.id); changed = true; } }
  async function find() {
    setFinding(true); setError('');
    try { const response = await fetch(`/api/workspaces/${workspaceId}/wiki?${new URLSearchParams({ collection: 'targets', q: query })}`); const data = await response.json() as WikiRelation[] & { error?: string }; if (!response.ok) throw new Error(data.error); setTargets(data); }
    catch { setError('関連する情報を検索できませんでした。'); } finally { setFinding(false); }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (uploading || busy) return; setBusy(true); setError('');
    try {
      const document = validateDocument(doc); const form = new FormData(e.currentTarget);
      const response = await fetch(`/api/workspaces/${workspaceId}/wiki`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: page ? 'update' : 'create', id: page?.id, expected_version: page?.version, title: form.get('title'), category: form.get('category'), status: form.get('status'), parent_id: form.get('parent_id'), related_ids: selected.map(r => r.id), body_doc: document }) });
      const result = await response.json() as { id?: string; error?: string }; if (!response.ok || !result.id) throw new Error(result.error ?? '保存できませんでした。');
      setDirty(false); router.push(`/app/w/${workspaceId}/wiki/${result.id}`); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : '保存できませんでした。'); } finally { setBusy(false); }
  }
  return <><Link className="work-back" href={`/app/w/${workspaceId}/wiki${page ? `/${page.id}` : ''}`}>← {page ? 'ページ詳細' : 'Wiki一覧'}</Link><h1>{page ? 'ページを編集' : 'Wikiページを作成'}</h1>
    <form className="wiki-edit-form" onSubmit={submit} onChange={() => setDirty(true)}>
      <Field label="ページタイトル" name="title" required maxLength={200} defaultValue={page?.title} placeholder="例：活動の始め方、定例会議の記録" />
      <div className="work-form-grid"><label className="if-field"><span>カテゴリ</span><input name="category" list="wiki-categories" required maxLength={40} defaultValue={page?.category ?? '未分類'} /><datalist id="wiki-categories">{options.categories.map(c => <option key={c} value={c} />)}</datalist></label>
        <label className="if-field"><span>公開状態</span><select name="status" defaultValue={page?.status ?? 'draft'}><option value="draft" disabled={!!page && page.created_by !== userId && !canManage(role)}>下書き（作成者・管理者のみ）</option><option value="published">共有する（ワークスペース内）</option></select></label></div>
      <label className="if-field"><span>親ページ</span><select name="parent_id" defaultValue={page?.parent_id ?? ''}><option value="">親ページなし</option>{options.pages.filter(p => !blockedParents.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.title}{p.status === 'draft' ? '（下書き）' : ''}</option>)}{page?.parent_id && !options.pages.some(p => p.id === page.parent_id) && <option value={page.parent_id}>削除済みの親ページ</option>}</select></label>
      <h2>本文</h2><WikiEditor key={page?.id ?? 'new'} workspaceId={workspaceId} pageId={page?.id} initial={page?.body_doc ?? emptyDocument} disabled={busy} onUploadBusy={setUploading} onChange={document => { setDoc(document); setDirty(true); }} />
      <section className="wiki-relations-editor"><h2>関連Issue・Project</h2><p className="work-subtle">参照先の情報をコピーせず、リンクとして保存します。</p><ul className="work-relations">{selected.map(target => <li key={target.id}><span>{target.kind === 'issue' ? 'Issue（課題）' : 'Project'}：{target.title}{target.archived_at && '（削除済み）'}</span><Button type="button" onClick={() => { setSelected(current => current.filter(r => r.id !== target.id)); setDirty(true); }}>外す</Button></li>)}</ul>
        <div className="wiki-target-search"><Field label="関連情報を検索" value={query} maxLength={200} onChange={e => setQuery(e.target.value)} /><Button type="button" disabled={finding} onClick={find}>{finding ? '検索中…' : '候補を探す'}</Button></div>
        {targets.length > 0 && <ul className="wiki-targets">{targets.filter(t => !selected.some(s => s.id === t.id)).map(target => <li key={target.id}><span>{target.kind === 'issue' ? '課題' : 'プロジェクト'}：{target.title}</span><Button type="button" disabled={selected.length >= 50} onClick={() => { setSelected(current => [...current, target]); setDirty(true); }}>追加</Button></li>)}</ul>}
      </section>
      {error && <p role="alert" className="if-error">{error}</p>}<div className="work-actions"><Button disabled={busy || uploading}>{uploading ? '画像の保存を待っています…' : busy ? '保存中…' : '保存する'}</Button><span className="work-subtle">{dirty ? '未保存の変更があります' : '変更はありません'}</span></div><p className="work-subtle">共有しても過去の下書き版は作成者・管理者だけが確認できます。</p>
    </form>
  </>;
}
export function WikiDetailView({ workspaceId, detail, options, people, role, userId }: { workspaceId: string; detail: WikiDetail; options: WikiOptions; people: Person[]; role: WorkspaceRole; userId: string }) {
  const page = detail.page; const router = useRouter(); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const editable = role !== 'viewer' && !page.archived_at && (page.status === 'published' || page.created_by === userId || canManage(role));
  const deletable = role !== 'viewer' && (page.created_by === userId || canManage(role));
  async function archive(operation: 'archive' | 'restore') {
    setBusy(true); setError('');
    try { const response = await fetch(`/api/workspaces/${workspaceId}/wiki`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, id: page.id, expected_version: page.version }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error); setConfirm(false); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '処理できませんでした。'); } finally { setBusy(false); }
  }
  const root = `/app/w/${workspaceId}`; const parent = options.pages.find(p => p.id === page.parent_id);
  return <><Link className="work-back" href={`${root}/wiki`}>← Wiki一覧</Link><div className="wiki-layout"><WikiTree workspaceId={workspaceId} pages={options.pages} currentId={page.id} /><article className="wiki-main">
    <header className="work-page-heading"><div><p className="if-kicker">WIKI · 第{page.current_revision}版</p><span className="if-badge">{page.category}</span><h1>{page.title}</h1><p className="work-subtle">{page.archived_at ? '削除済み · ' : ''}{page.status === 'draft' ? '下書き（作成者・管理者のみ）' : 'ワークスペース内で共有中'}</p></div><div className="work-actions">{editable && <Link className="if-button" href={`${root}/wiki/${page.id}/edit`}>編集する</Link>}{deletable && <Button disabled={busy} onClick={() => page.archived_at ? archive('restore') : setConfirm(true)}>{page.archived_at ? '復元する' : '削除する'}</Button>}</div></header>
    {page.parent_id && <p className="work-subtle">親ページ：{parent ? <Link href={`${root}/wiki/${parent.id}`}>{parent.title}</Link> : '削除済みのページ'}</p>}{error && <p role="alert" className="if-error">{error}</p>}
    <section className="wiki-reading"><WikiBody document={page.body_doc} workspaceId={workspaceId} /></section>
    <section className="work-panel"><h2>関連情報</h2>{detail.relations.length ? <ul className="work-relations">{detail.relations.map(target => <li key={target.id}><Link href={`${root}/${target.kind === 'issue' ? 'issues' : 'projects'}/${target.id}`}>{target.kind === 'issue' ? 'Issue（課題）' : 'Project'}：{target.title}{target.archived_at && '（削除済み）'}</Link></li>)}</ul> : <p>関連する課題・プロジェクトはまだありません。</p>}</section>
    <section className="work-panel"><h2>更新履歴・過去バージョン</h2><p className="work-subtle">最近の100版を表示します。版は削除せず保持しています。</p><ol className="wiki-revisions">{detail.revisions.map(rev => <li key={rev.id}><Link href={`${root}/wiki/${page.id}/history/${rev.revision}`}>第{rev.revision}版 — {rev.title}</Link><span>{people.find(p => p.user_id === rev.edited_by)?.display_name ?? '脱退済みメンバー'} · {new Date(rev.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} · {rev.metadata.action === 'archive' ? '削除' : rev.metadata.action === 'restore' ? '復元' : rev.metadata.status === 'draft' ? '下書き' : '共有'}</span></li>)}</ol></section>
  </article></div>{confirm && <Modal title="ページを削除しますか？" onClose={() => { if (!busy) setConfirm(false); }}><p>通常の一覧から外します。子ページ・関連先・過去の版・添付画像は残し、削除済み一覧から復元できます。</p>{error && <p role="alert">{error}</p>}<Button disabled={busy} onClick={() => archive('archive')}>{busy ? '削除中…' : '削除する'}</Button></Modal>}</>;
}
