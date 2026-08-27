import { getCrossSell } from '@/lib/crosssell/query';
import ProductGrid from '@/components/catalog/ProductGrid';

export default async function CrossSell({ product }: { product: { id: number; categoryId: number; price: { toString(): string } } }) {
  const { accessories, similar } = await getCrossSell(product);
  if (accessories.length === 0 && similar.length === 0) return null;

  return (
    <>
      {accessories.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold mb-4">С этим товаром покупают</h2>
          <ProductGrid items={accessories} />
        </section>
      )}
      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold mb-4">Похожие товары</h2>
          <ProductGrid items={similar} />
        </section>
      )}
    </>
  );
}
