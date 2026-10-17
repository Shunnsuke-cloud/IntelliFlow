"use client";
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { useState, useRef, useEffect } from 'react';
import { attachmentUrl, safeHref, uuidPattern, type WikiNode } from '../document';
import { Button, Field, Modal } from '@/components/ui/controls';

export default function WikiEditor({ workspaceId, pageId, initial, onChange, onUploadBusy, disabled = false }: {
  workspaceId: string; pageId?: string; initial: WikiNode; onChange: (document: unknown) => void; onUploadBusy: (busy: boolean) => void; disabled?: boolean;
}) {
  const [error, setError] = useState(''); const [uploading, setUploading] = useState(false); const [linkOpen, setLinkOpen] = useState(false); const [href, setHref] = useState(''); const input = useRef<HTMLInputElement>(null);
  const ImageNode = Node.create({
    name: 'image', group: 'block', atom: true, draggable: true,
    addAttributes() { return { attachmentId: { default: null, parseHTML: element => element.getAttribute('data-attachment-id') }, alt: { default: '', parseHTML: element => element.getAttribute('alt') ?? '' } }; },
    parseHTML() { return [{ tag: 'img[data-attachment-id]' }]; },
    renderHTML({ node }) {
      const id = String(node.attrs.attachmentId ?? ''); return ['img', { src: uuidPattern.test(id) ? attachmentUrl(workspaceId, id) : '', alt: String(node.attrs.alt ?? ''), 'data-attachment-id': id }];
    },
  });
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ blockquote: false, code: false, codeBlock: false, horizontalRule: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: url => !!safeHref(url) } }), TaskList, TaskItem.configure({ nested: true }), ImageNode],
    content: initial, editable: !disabled,
    editorProps: { attributes: { 'aria-label': 'Wiki本文', role: 'textbox', 'aria-multiline': 'true', class: 'wiki-prose wiki-editor-content' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  const state = useEditorState({ editor, selector: ({ editor }) => ({ bold: editor?.isActive('bold'), italic: editor?.isActive('italic'), bullet: editor?.isActive('bulletList'), task: editor?.isActive('taskList'), undo: editor?.can().undo(), redo: editor?.can().redo() }) });
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  async function upload(file?: File) {
    if (!file || !pageId || !editor) return; setUploading(true); onUploadBusy(true); setError('');
    try {
      if (file.size > 3145728) throw new Error('画像は3MB以下にしてください。');
      const form = new FormData(); form.set('page_id', pageId); form.set('image', file);
      const response = await fetch(`/api/workspaces/${workspaceId}/wiki/attachments`, { method: 'POST', body: form }); const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? '画像を保存できませんでした。');
      editor.chain().focus().insertContent({ type: 'image', attrs: { attachmentId: result.id, alt: file.name.slice(0, 300) } }).run();
    } catch (err) { setError(err instanceof Error ? err.message : '画像を保存できませんでした。'); } finally { setUploading(false); onUploadBusy(false); if (input.current) input.current.value = ''; }
  }
  if (!editor) return <p role="status">エディタを準備しています…</p>;
  return <div className="wiki-editor">
    <div className="wiki-toolbar" role="toolbar" aria-label="文章の書式">
      <select aria-label="見出しの種類" disabled={disabled} value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : '0'} onChange={e => e.target.value === '0' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().toggleHeading({ level: Number(e.target.value) as 1 | 2 | 3 }).run()}><option value="0">本文</option><option value="1">大見出し</option><option value="2">中見出し</option><option value="3">小見出し</option></select>
      <Button type="button" disabled={disabled} aria-pressed={!!state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>太字</Button>
      <Button type="button" disabled={disabled} aria-pressed={!!state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>斜体</Button>
      <Button type="button" disabled={disabled} aria-pressed={!!state?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>箇条書き</Button>
      <Button type="button" disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>番号付き</Button>
      <Button type="button" disabled={disabled} aria-pressed={!!state?.task} onClick={() => editor.chain().focus().toggleTaskList().run()}>チェックリスト</Button>
      <Button type="button" disabled={disabled} onClick={() => { setHref(String(editor.getAttributes('link').href ?? '')); setLinkOpen(true); }}>リンク</Button>
      <Button type="button" disabled={disabled || !pageId || uploading} onClick={() => input.current?.click()}>{uploading ? '画像を保存中…' : '画像を追加'}</Button>
      <Button type="button" disabled={disabled || !state?.undo} onClick={() => editor.chain().focus().undo().run()}>元に戻す</Button><Button type="button" disabled={disabled || !state?.redo} onClick={() => editor.chain().focus().redo().run()}>やり直す</Button>
    </div>
    {!pageId && <p className="work-subtle">画像はページを一度保存した後で追加できます。</p>}<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="画像を選択" onChange={e => upload(e.target.files?.[0])} />
    {error && <p role="alert" className="if-error">{error}</p>}<EditorContent editor={editor} />
    {linkOpen && <Modal title="リンクを設定" onClose={() => setLinkOpen(false)}><form onSubmit={e => { e.preventDefault(); const safe = safeHref(href); if (!safe) { setError('https://、http://、mailto:で始まるリンクを指定してください。'); return; } editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run(); setLinkOpen(false); setError(''); }}><Field label="リンク先" value={href} maxLength={2000} required onChange={e => setHref(e.target.value)} placeholder="https://example.com" /><Button>設定する</Button><Button type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); }}>リンクを外す</Button></form></Modal>}
  </div>;
}
