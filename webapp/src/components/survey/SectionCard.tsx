import type { PropsWithChildren, ReactNode } from 'react'

import { Typography } from '@/components/typography'
import { cn } from '@/lib/utils'

/** Секционная карточка страницы (прототип: .card): заголовок, опциональные действия и тело. */
export function SectionCard({
  title,
  description,
  actions,
  className,
  contentClassName,
  children,
}: PropsWithChildren<{
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  contentClassName?: string
}>) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-sm', className)}>
      {title !== undefined || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title ? (
              <Typography as="h2" truncate variant="control">
                {title}
              </Typography>
            ) : null}
            {description ? (
              <Typography as="p" tone="muted" variant="caption">
                {description}
              </Typography>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </section>
  )
}

/** Пустое состояние раздела (прототип: .empty): рамка-пунктир, заголовок, описание, действие. */
export function SurveyEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center',
        className,
      )}
    >
      <Typography as="h3" variant="bodySmMedium">
        {title}
      </Typography>
      {description ? (
        <Typography as="p" className="max-w-sm" tone="muted" variant="bodySm">
          {description}
        </Typography>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
