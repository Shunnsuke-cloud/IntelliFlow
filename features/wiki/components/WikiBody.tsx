import type { ReactNode } from 'react';
import { attachmentUrl, safeHref, validateDocument, type WikiNode } from '../document';
export default function WikiBody({ document, workspaceId }: { document: unknown; workspaceId: string }) {
  let safe: WikiNode; try { safe = validateDocument(document); } catch { return <p role="alert">本文を安全に表示できません。管理者にお問い合わせください。</p>; }
  function render(node: WikiNode, key: number): ReactNode {
    const children = node.content?.map(render);
    if (node.type === 'text') {
      let text: ReactNode = node.text;
      for (const [i, mark] of (node.marks ?? []).entries()) {
        if (mark.type === 'bold') text = <strong key={i}>{text}</strong>;
        else if (mark.type === 'italic') text = <em key={i}>{text}</em>;
        else if (mark.type === 'strike') text = <s key={i}>{text}</s>;
        else if (mark.type === 'underline') text = <u key={i}>{text}</u>;
        else if (mark.type === 'link' && safeHref(mark.attrs?.href)) text = <a key={i} href={safeHref(mark.attrs?.href)!} rel="noopener noreferrer nofollow" target="_blank">{text}</a>;
      }
      return <span key={key}>{text}</span>;
    }
    switch (node.type) {
      case 'doc': return <div key={key} className="wiki-prose">{children}</div>;
      case 'paragraph': return <p key={key}>{children?.length ? children : <br />}</p>;
      case 'heading': return node.attrs?.level === 1 ? <h2 key={key}>{children}</h2> : node.attrs?.level === 2 ? <h3 key={key}>{children}</h3> : <h4 key={key}>{children}</h4>;
      case 'bulletList': return <ul key={key}>{children}</ul>;
      case 'orderedList': return <ol key={key} start={node.attrs?.start}>{children}</ol>;
      case 'listItem': return <li key={key}>{children}</li>;
      case 'taskList': return <ul key={key} className="wiki-checklist">{children}</ul>;
      case 'taskItem': return <li key={key}><input type="checkbox" checked={!!node.attrs?.checked} readOnly aria-label={node.attrs?.checked ? '確認済み' : '未確認'} /><div>{children}</div></li>;
      case 'hardBreak': return <br key={key} />;
      // Authorized same-origin download only; user HTML and external image URLs are never rendered.
      // eslint-disable-next-line @next/next/no-img-element
      case 'image': return <figure key={key}><img src={attachmentUrl(workspaceId, node.attrs!.attachmentId!)} alt={node.attrs?.alt ?? ''} loading="lazy" />{node.attrs?.alt && <figcaption>{node.attrs.alt}</figcaption>}</figure>;
      default: return null;
    }
  }
  return render(safe, 0);
}
