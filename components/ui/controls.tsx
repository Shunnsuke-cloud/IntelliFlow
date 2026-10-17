"use client";
import { useEffect, useRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`if-button ${className}`} />; }
export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId(); return <label className="if-field" htmlFor={id}><span>{label}</span><input {...props} id={id} /></label>;
}
export function State({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  return <section className={`if-state ${error ? 'if-error' : ''}`} role={error ? 'alert' : 'status'}><h2>{title}</h2>{children}</section>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="if-modal" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div><header><h2 id={titleId}>{title}</h2><Button type="button" onClick={onClose} aria-label="閉じる">×</Button></header>{children}</div></dialog>;
}
