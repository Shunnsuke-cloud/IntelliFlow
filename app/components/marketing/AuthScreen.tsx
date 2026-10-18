import Brand, { Arrow } from './Brand';
import FlowGraph from './FlowGraph';
import SupabaseAuth from '../SupabaseAuth';
import Link from 'next/link';
import '../../landing.css';
import '../../auth-public.css';

export default function AuthScreen({ signup = false, next, error = false }: { signup?: boolean; next: string; error?: boolean }) {
  return <main className="public-ui auth-page"><section className="a-brand-panel" aria-label="IntelliFlowについて"><Brand /><div className="a-brand-content"><span className="m-eyebrow">CONNECT TODAY. PASS IT ON.</span><h2>情報をつなぎ、<br/><span>次の人へ。</span></h2><p>あなたが残した知識が、<br/>次の誰かの一歩になる。</p><div className="a-brand-graph"><FlowGraph compact /></div><div className="a-brand-features"><span>◉ 課題を整理</span><span>⌘ 経緯をたどる</span><span>↗ 知識を引き継ぐ</span></div></div><span className="a-brand-bottom">KEEP THE KNOWLEDGE FLOWING.</span></section><section className="a-form-panel" aria-label={signup ? '新規登録' : 'ログイン'}><Link className="a-back" href="/"><Arrow /> 紹介ページへ戻る</Link><div className="a-mobile-brand"><Brand /></div><SupabaseAuth key={signup ? 'signup' : 'signin'} initialView={signup ? 'signup' : 'signin'} onSignedInRedirectTo={next} callbackError={error}/><span className="a-copyright">© {new Date().getFullYear()} IntelliFlow</span></section></main>;
}
