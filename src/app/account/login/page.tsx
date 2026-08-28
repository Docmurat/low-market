export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import LoginForm from '@/components/account/LoginForm';

export const metadata = { title: 'Вход' };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/account');

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <span>Вход</span>
      </nav>

      <h1 className="mb-6 text-2xl font-bold font-display">Вход в личный кабинет</h1>
      <LoginForm />

      <p className="mt-6 text-xs text-steel">
        Входя, вы соглашаетесь с условиями обработки персональных данных.
        Гостевые заказы, оформленные на этот номер телефона, появятся в кабинете автоматически.
      </p>
    </div>
  );
}
