'use server';
/**
 * Server actions раздела «Заказы» админки.
 * setOrderStatus — смена статуса заказа кнопкой на карточке заказа.
 * Переходы не ограничиваем (админ может исправить любую ошибку),
 * но статус принимается только из известного списка.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ORDER_STATUS_LABEL } from '@/lib/checkout-shared';

export async function setOrderStatus(fd: FormData): Promise<void> {
  await requireAdmin(); // защита и на уровне action, не только страницы

  const orderId = Number(fd.get('orderId'));
  const status = String(fd.get('status') ?? '');

  if (!Number.isInteger(orderId) || orderId <= 0) redirect('/admin/orders');
  if (!(status in ORDER_STATUS_LABEL)) redirect(`/admin/orders/${orderId}`);

  await prisma.order.update({ where: { id: orderId }, data: { status } });

  revalidatePath('/admin', 'layout'); // сводка и списки
  redirect(`/admin/orders/${orderId}`);
}
