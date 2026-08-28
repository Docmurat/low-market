'use server';
/**
 * Server actions раздела «Товары» админки.
 *  setProductCategory    — переложить товар в категорию + categoryLocked=true
 *                          (синк такую категорию не перезаписывает — правка в
 *                          scripts/sync-supplier.ts).
 *  unlockProductCategory — снять защиту, категорию снова ведёт синк.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function setProductCategory(fd: FormData): Promise<void> {
  await requireAdmin();

  const productId = Number(fd.get('productId'));
  const categoryId = Number(fd.get('categoryId'));
  if (!Number.isInteger(productId) || productId <= 0) redirect('/admin/products');
  if (!Number.isInteger(categoryId) || categoryId <= 0) redirect(`/admin/products/${productId}`);

  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) redirect(`/admin/products/${productId}`);

  await prisma.product.update({
    where: { id: productId },
    data: { categoryId, categoryLocked: true },
  });

  revalidatePath('/', 'layout'); // каталог, карточка, кросс-продажи
  redirect(`/admin/products/${productId}`);
}

export async function unlockProductCategory(fd: FormData): Promise<void> {
  await requireAdmin();

  const productId = Number(fd.get('productId'));
  if (!Number.isInteger(productId) || productId <= 0) redirect('/admin/products');

  await prisma.product.update({
    where: { id: productId },
    data: { categoryLocked: false },
  });

  revalidatePath('/', 'layout');
  redirect(`/admin/products/${productId}`);
}
