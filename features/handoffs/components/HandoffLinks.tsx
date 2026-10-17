"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/controls';
import { handoffStatuses, type HandoffListing } from '../types';
export default function HandoffLinks({ workspaceId, resourceId, canCreate = false }: { workspaceId: string; resourceId: string; canCreate?: boolean }) {
  const [listing, setListing] = useState<HandoffListing | null>(null); const [error, setError] = useState(''); const [offset, setOffset] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspaces/${workspaceId}/handoffs?${new URLSearchParams({ collection: 'backlinks', id: resourceId, offset: String(offset) })}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(); setListing(data as HandoffListing); setError(''); }).catch(() => { if (!controller.signal.aborted) setError('関連する引き継ぎを取得できませんでした。接続・DB設定を確認してください。'); });
    return () => controller.abort();
  }, [workspaceId, resourceId, offset]);
  return <section className="handoff-links"><h3>関連するHandoff（引き継ぎ）</h3>{canCreate && <Link className="if-button" href={`/app/w/${workspaceId}/handoffs/new?source_id=${resourceId}`}>この情報から引き継ぎを作る</Link>}{error ? <p role="alert">{error}</p> : !listing ? <p role="status">引き継ぎを確認しています…</p> : <>{listing.items.length ? <ul>{listing.items.map(h => <li key={h.id}><Link href={`/app/w/${workspaceId}/handoffs/${h.id}`}>{h.title}</Link><small>{handoffStatuses[h.status]} · 第{h.current_version}版</small></li>)}</ul> : <p className="work-subtle">関連する引き継ぎはまだありません。</p>}{(listing.has_more || offset > 0) && <div className="work-actions"><Button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 20))}>前へ</Button><Button disabled={!listing.has_more || offset >= 10000} onClick={() => setOffset(offset + 20)}>次へ</Button></div>}</>}</section>;
}
