import AuthScreen from '../components/marketing/AuthScreen';
import { safeNext } from '@/lib/auth/policy';
export const metadata = { title: '新規登録 | IntelliFlow' };
export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <AuthScreen signup next={safeNext(params.next)} />;
}
