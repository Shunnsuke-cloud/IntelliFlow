import Link from 'next/link';
export function Mark() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 8h10l8 16M7 24h10L25 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle cx="7" cy="8" r="4" fill="currentColor"/><circle cx="7" cy="24" r="4" fill="currentColor"/><circle cx="25" cy="8" r="4" fill="currentColor"/><circle cx="25" cy="24" r="4" fill="currentColor"/></svg>;
}
export default function Brand() { return <Link href="/" className="m-brand" aria-label="IntelliFlow ホーム"><Mark /><span>IntelliFlow<span className="m-brand-dot">.</span></span></Link>; }
export function Arrow({ diagonal = false }: { diagonal?: boolean }) { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
