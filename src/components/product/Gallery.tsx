'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div>
      <div className="relative aspect-square rounded-2xl bg-card border border-line overflow-hidden">
        {current ? (
          <Image src={current} alt={alt} fill className="object-contain p-8" sizes="(max-width: 1024px) 100vw, 50vw" priority />
        ) : (
          <div className="flex h-full items-center justify-center text-8xl text-gray-200">⚡</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              className={`relative h-16 w-16 shrink-0 rounded-lg border bg-card overflow-hidden ${i === active ? 'border-volt ring-2 ring-volt' : 'border-line hover:border-volt'}`}
              aria-label={`Фото ${i + 1}`}
            >
              <Image src={src} alt="" fill className="object-contain p-1" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
