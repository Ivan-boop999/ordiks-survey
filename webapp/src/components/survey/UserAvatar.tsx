import { Typography } from '@/components/typography'
import { initialsOf } from '@/features/survey/model'
import { cn } from '@/lib/utils'

const PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-600',
]

/** Детерминированный цвет аватара по имени — стабильный между рендерами, без бэкенда. */
function colorFor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 997
  }
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]
}

/** Круглый аватар с инициалами (прототип: .avatar). */
export function UserAvatar({
  name,
  email,
  title,
  className,
}: {
  name: string | null | undefined
  email?: string | null
  title?: string
  className?: string
}) {
  const label = name?.trim() || email || '?'
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 select-none items-center justify-center rounded-full text-white',
        colorFor(label),
        className,
      )}
      title={title ?? label}
    >
      <Typography as="span" variant="controlXs">
        {initialsOf(name ?? email)}
      </Typography>
    </span>
  )
}
