import ProductCard from '@/components/ProductCard';

type Item = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  price: { toString(): string };
  stock: number;
  images: string[];
  supplierSku: string;
  gism?: boolean;
};

export default function ProductGrid({ items, emptyText = 'Ничего не найдено. Попробуйте убрать часть фильтров.' }: { items: Item[]; emptyText?: string }) {
  if (items.length === 0) return <p className="text-steel">{emptyText}</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((p) => (
        <ProductCard
          key={p.id}
          id={p.id}
          slug={p.slug}
          name={p.name}
          brand={p.brand}
          price={p.price.toString()}
          stock={p.stock}
          image={p.images[0]}
          sku={p.supplierSku}
          gism={p.gism}
        />
      ))}
    </div>
  );
}
