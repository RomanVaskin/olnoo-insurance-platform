import Image from 'next/image'
import { ArrowRight, ShieldCheck } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-7xl px-5 pt-12 md:px-8 md:pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
            Страхование проще
          </span>

          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-tight text-foreground md:text-7xl lg:text-[5.5rem]">
            Страхование спортсменов
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
            Для тренировок, соревнований и спортивных сборов. Электронный полис за
            несколько минут — без бумаг и очередей.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#products"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 sm:w-auto"
            >
              Оформить страховку
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#coverage"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
            >
              Подробнее
            </a>
          </div>
        </div>

        {/* Large premium sports image */}
        <div className="relative mt-12 md:mt-16">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-border sm:aspect-[16/10] lg:aspect-[21/9]">
            <Image
              src="/images/hero-athlete.png"
              alt=""
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="scale-105 object-cover blur-sm"
              aria-hidden="true"
            />
            <Image
              src="/images/hero-athlete.png"
              alt="Спортсмен на тренировке"
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

            {/* Floating policy chip */}
            <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-white/20 bg-black/40 px-4 py-3 backdrop-blur-md md:bottom-6 md:left-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <ShieldCheck className="size-5" />
              </span>
              <div className="text-left">
                <p className="text-sm font-medium text-white">Электронный полис</p>
                <p className="text-xs text-white/70">Приходит на почту сразу после оплаты</p>
              </div>
            </div>
          </div>
        </div>

        {/* Trust row */}
        <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {[
            { k: 'Покрытие спортивных травм', v: 'До 1 500 000 ₽ страховой суммы' },
            { k: 'Оформление онлайн', v: 'Полис за 5 минут, без визитов' },
            { k: 'Тренировки и соревнования', v: 'Один полис на все активности' },
          ].map((item) => (
            <div key={item.k} className="bg-card px-5 py-5">
              <dt className="text-sm font-medium text-foreground">{item.k}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{item.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
