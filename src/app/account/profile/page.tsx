export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { formatPhone } from '@/lib/checkout-shared';
import ProfileForm from '@/components/account/ProfileForm';

export const metadata = { title: 'Профиль' };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/account/login');

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <Link href="/account" className="charge-link">Личный кабинет</Link>
        <span className="mx-2">/</span>
        <span>Профиль</span>
      </nav>

      <h1 className="mb-2 text-2xl font-bold font-display">Профиль</h1>
      <p className="mb-6 text-sm text-steel">
        Телефон аккаунта: <span className="font-semibold text-ink">{formatPhone(user.phone)}</span>
        {' '}(смена номера — через поддержку, чтобы заказы не потерялись)
      </p>

      <ProfileForm
        initialName={user.name}
        initialEmail={user.email ?? ''}
        hasPassword={user.hasPassword}
      />
    </div>
  );
}
