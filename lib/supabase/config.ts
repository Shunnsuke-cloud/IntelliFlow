export function publicKey(key: string | undefined) {
  if (!key || key.startsWith('sb_secret_')) return false;
  if (key.startsWith('sb_publishable_')) return true;
  try { return (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }).role === 'anon'; } catch { return false; }
}
export function serverConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicKey(key)) throw new Error('認証の環境設定を確認してください。');
  return { url, key: key! };
}
