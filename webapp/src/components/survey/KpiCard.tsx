import type { ChipColor } from '@ordiks-survey/contracts'
import type { ReactNode } from 'react'

import { Typography } from '@/components/typography'
import { cn } from '@/lib/utils'
import { iconPlateClass } from './chip-colors'
import { ProgressBar } from './ProgressBar'

type KpiTone = 'default' | 'warn' | 'danger'

const valueToneClass: Record<KpiTone, string> = {
  default: 'text-foreground',
  warn: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
}

/**
 * KPI-карточка дашборда (прототип: .card.stat): подпись, крупное значение, иконка в цветной
 * плашке, опциональные прогресс-бар и пояснение.
 */
export function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
  color = 'blue',
  progress,
  onClick,
  className,
}: {
  icon?: ReactNode
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: KpiTone
  color?: ChipColor
  progress?: { done: number; max: number }
  onClick?: () => void
  className?: string
}) {
  const clickable = Boolean(onClick)
  return (
    <div
      className={cn(
        'relative flex flex-col gap-1.5 rounded-xl border bg-card p-4 shadow-sm',
        clickable &&
          'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
        className,
      )}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            'absolute top-3 right-3 flex size-8 items-center justify-center rounded-lg [&_svg]:size-4',
            iconPlateClass[color],
          )}
        >
          {icon}
        </span>
      ) : null}
      <Typography as="span" className="max-w-[calc(100%-2.5rem)]" tone="muted" variant="caption">
        {label}
      </Typography>
      <Typography as="span" className={cn('tabular-nums', valueToneClass[tone])} variant="h3">
        {value}
      </Typography>
      {progress ? <ProgressBar done={progress.done} max={progress.max} tone="primary" /> : null}
      {hint ? (
        <Typography as="span" tone="muted" variant="caption">
          {hint}
        </Typography>
      ) : null}
    </div>
  )
}
