import Link from 'next/link'
import { Logo } from '@/components/brand'

const columns = [
  {
    title: 'Продукты',
    links: [
      { label: 'Спорт', href: '/sport' },
      { label: 'Путешествия', href: '/insurance' },
      { label: 'Здоровье', href: '/insurance' },
      { label: 'Все продукты', href: '/insurance' },
    ],
  },
  {
    title: 'Платформа',
    links: [
      { label: 'Партнёрам', href: '/partners' },
      { label: 'Федерациям', href: '/federation' },
      { label: 'Агентствам', href: '/agency' },
      { label: 'Админ-панель', href: '/admin/products' },
    ],
  },
  {
    title: 'Компания',
    links: [
      { label: 'О нас', href: '/' },
      { label: 'Контакты', href: '/' },
      { label: 'Документы', href: '/' },
      { label: 'Поддержка', href: '/' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">
              Универсальная страховая платформа. Страхование проще — выбирайте,
              сравнивайте и оформляйте полисы в одном месте.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-medium text-foreground">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 OLNOO Insurance. Все права защищены.</p>
          <p>Лицензия ЦБ РФ · Страхование проще.</p>
        </div>
      </div>
    </footer>
  )
}
