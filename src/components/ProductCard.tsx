import Link from 'next/link';
import Image from 'next/image';
import { formatPrice } from '@/lib/format';

type Props = {
  slug: string;
  name: string;
  brand: string;
  price: string | number;
  stock: number;
  image?: string;
  sku: string;
};

export default function ProductCard({ slug, name, brand, price, stock, image, sku }: Props) {
  return (
    <Link
      href={`/product/${slug}`}
      className="group flex flex-col rounded-xl bg-card border border-line p-4 hover:shadow-lg hover:border-volt transition-all"
    >
      <div className="relative aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden">
        {image ? (
          <Image src={image} alt={name} fill className="object-contain p-2" sizes="(max-width: 640px) 50vw, 25vw" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-gray-300">⚡</div>
        )}
      </div>
      <div className="text-xs text-steel font-mono mb-1">{sku}</div>
      <div className="text-sm font-medium leading-snug flex-1 group-hover:text-ink">
        {brand && <span className="font-semibold">{brand} </span>}
        {name}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-lg font-bold tabular-nums">{formatPrice(price)}</span>
        <span className={`text-xs font-medium ${stock > 0 ? 'text-green-600' : 'text-steel'}`}>
          {stock > 0 ? 'В наличии' : 'Под заказ'}
        </span>
      </div>
    </Link>
  );
}
