import Link from 'next/link';
import Image from 'next/image';
import { formatPrice } from '@/lib/format';
import AddToCartButton from '@/components/cart/AddToCartButton';

type Props = {
  slug: string;
  name: string;
  brand: string;
  price: string | number;
  stock: number;
  image?: string;
  sku: string;
  /** id товара — если передан, показываем кнопку «В корзину» */
  id?: number;
  gism?: boolean;
};

export default function ProductCard({ slug, name, brand, price, stock, image, sku, id, gism }: Props) {
  return (
    <div className="group flex flex-col rounded-xl bg-card border border-line p-4 hover:shadow-lg hover:border-volt transition-all">
      <Link href={`/product/${slug}`} className="flex flex-1 flex-col">
        <div className="relative aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden">
          {image ? (
            <Image src={image} alt={name} fill className="object-contain p-2" sizes="(max-width: 640px) 50vw, 25vw" />
          ) : (
            // Товар опубликован с заглушкой (см. src/lib/visibility.ts)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/photo-stub.svg"
              alt="Фото скоро появится"
              className="absolute inset-0 h-full w-full object-contain p-2"
            />
          )}
        </div>
        <div className="text-xs text-steel font-mono mb-1">{sku}</div>
        <div className="text-sm font-medium leading-snug flex-1 group-hover:text-ink">
          {brand && <span className="font-semibold">{brand} </span>}
          {name}
        </div>
      </Link>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-lg font-bold tabular-nums">{formatPrice(price)}</span>
        <span className={`text-xs font-medium ${stock > 0 ? 'text-green-600' : 'text-steel'}`}>
          {stock > 0 ? 'В наличии' : 'Под заказ'}
        </span>
      </div>
      {id != null && (
        <div className="mt-3">
          <AddToCartButton productId={id} stock={stock} gism={gism} size="sm" />
        </div>
      )}
    </div>
  );
}
