import Image from 'next/image'

import Link from 'next/link'

import { ArrowUpRight } from 'lucide-react'

import type { Category } from '@/lib/data'

import { cn } from '@/lib/utils'

export function CategoryCard({
  category,
  href,
  featured = false,
}: {
  category: Category
  href?: string
  featured?: boolean
}) {
  const link =
    href ??
    (category.slug === 'sport'
      ? 'https://sport.insurance.olnoo.com'
      : '/insurance')

  return (
    <Link
      href={link}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-lg hover:shadow-foreground/5',
        featured ? 'sm:col-span-2 lg:row-span-2 lg:flex lg:flex-col' : '',
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden',
          featured
            ? 'aspect-[16/10] lg:aspect-auto lg:min-h-0 lg:flex-1'
            : 'aspect-[16/10]',
        )}
      >
        <Image
          src={category.image || '/placeholder.svg'}
          alt={category.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />

        {featured ? (
          <span className="absolute top-4 left-4 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
            Основное направление
          </span>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-3 p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {category.name}
          </h3>

          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {category.description}
          </p>

          <p className="pt-1 text-xs text-muted-foreground">
            {category.products} продуктов
          </p>
        </div>

        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-brand group-hover:text-brand">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
    </Link>
  )
}
