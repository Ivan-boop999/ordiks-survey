import type { ChipColor } from '@ordiks-survey/contracts'

import { Typography } from '@/components/typography'
import { cn } from '@/lib/utils'
import { chipColorClass } from './chip-colors'

/** Статус-чип прототипа (.chip): маленькая пилюля с цветом из палитры приложения. */
export function StatusChip({
  children,
  className,
  color = 'gray',
  outline = false,
}: {
  children: React.ReactNode
  className?: string
  color?: ChipColor
  outline?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 tabular-nums',
        outline ? 'border-border bg-transparent text-muted-foreground' : chipColorClass[color],
        className,
      )}
    >
      <Typography as="span" variant="controlXs" wrap="nowrap">
        {children}
      </Typography>
    </span>
  )
}

/** Точечный индикатор цвета палитры (прототип: .dot). */
export function ColorDot({ color, className }: { color: ChipColor; className?: string }) {
  const dotColor: Record<ChipColor, string> = {
    gray: 'bg-slate-400',
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    purple: 'bg-violet-500',
  }
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', dotColor[color], className)} />
}
