import AuthScreen from '../components/marketing/AuthScreen';
import { safeNext } from '@/lib/auth/policy';
export const metadata = { title: 'ログイン | IntelliFlow' };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthScreen next={safeNext(params.next)} error={Boolean(params.error)} />;
}
