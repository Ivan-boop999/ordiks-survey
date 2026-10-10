import { cn } from '@/lib/utils'

type ProgressTone = 'primary' | 'green' | 'red' | 'amber'

const toneClass: Record<ProgressTone, string> = {
  primary: 'bg-primary',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
}

/**
 * Прогресс-бар прототипа (.bar/.fill): тонкая полоса с долей `done/max`.
 * `max === 0` рисует пустую дорожку — деления на ноль и «рваные» проценты исключены.
 */
export function ProgressBar({
  done,
  max,
  tone = 'primary',
  className,
  label,
}: {
  done: number
  max: number
  tone?: ProgressTone
  className?: string
  label?: string
}) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, done / max)) : 0
  return (
    <div
      aria-label={label ?? `${done} из ${max}`}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={done}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', toneClass[tone])}
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </div>
  )
}
