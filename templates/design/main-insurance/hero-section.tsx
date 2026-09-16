import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-8 lg:py-24 lg:px-8">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand" />
            Универсальная страховая платформа
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground text-balance sm:text-5xl lg:text-6xl">
            Страхование проще.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">
            Выбирайте страховые продукты от проверенных провайдеров, сравнивайте
            предложения и управляйте полисами в одном месте. Сейчас в фокусе —
            страхование спорта.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="h-11 px-6 text-[15px]"
              render={
                <Link href="/insurance">
                  Выбрать страховку
                  <ArrowRight className="size-4" />
                </Link>
              }
            />
            <Button
              variant="outline"
              size="lg"
              className="h-11 px-6 text-[15px]"
              render={<Link href="/partners">Партнёрам</Link>}
            />
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-6">
            {[
              { v: '5+', l: 'страховых компаний' },
              { v: '60+', l: 'продуктов в каталоге' },
              { v: '120K', l: 'застрахованных спортсменов' },
            ].map((s) => (
              <div key={s.l}>
                <dt className="text-2xl font-semibold tracking-tight text-foreground">
                  {s.v}
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground text-pretty">
                  {s.l}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border lg:aspect-[5/4]">
            <Image
              src="/images/home-hero.png"
              alt="Спортсмен на современной арене"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-5 left-5 hidden max-w-xs rounded-2xl border border-border bg-card p-4 shadow-lg shadow-foreground/5 sm:block">
            <p className="text-xs text-muted-foreground">Кубок России по дзюдо</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              397 из 432 участников застрахованы
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-[92%] rounded-full bg-success" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
