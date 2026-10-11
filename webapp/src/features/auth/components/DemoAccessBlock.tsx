import { useEffect, useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { DEMO_ACCOUNTS } from './demo-accounts'

/**
 * Демо-доступ на странице входа: показывается только при VITE_DEMO_HINTS=1. Кнопки подставляют
 * демо-email и пароль из VITE_DEMO_PASSWORD в форму (если пароль не задан — ввод вручную).
 */
export function DemoAccessBlock({
  onPick,
}: {
  onPick: (demo: { email: string; password: string }) => void
}) {
  const demoPassword = import.meta.env?.VITE_DEMO_PASSWORD ?? ''
  const [picked, setPicked] = useState<string | null>(null)

  // Выбор сбрасывается, чтобы подсказка не «залипала» после ручной правки полей.
  useEffect(() => {
    if (!picked) return
    const timer = setTimeout(() => setPicked(null), 2500)
    return () => clearTimeout(timer)
  }, [picked])

  return (
    <div
      className="rounded-lg border border-dashed border-violet-300 bg-violet-50/60 p-3 dark:border-violet-400/30 dark:bg-violet-500/10"
      data-testid="demo-access-block"
    >
      <Typography as="p" className="mb-2 text-violet-700 dark:text-violet-300" variant="controlXs">
        Демо-доступ
      </Typography>
      <div className="grid grid-cols-2 gap-1.5">
        {DEMO_ACCOUNTS.map((account) => (
          <Button
            data-testid={`demo-login-${account.key}`}
            key={account.key}
            onClick={() => {
              setPicked(account.key)
              onPick({ email: account.email, password: demoPassword })
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {account.label}
          </Button>
        ))}
      </div>
      <Typography as="p" className="mt-2" tone="muted" variant="caption">
        {demoPassword
          ? picked
            ? 'Подставлено — нажмите Login.'
            : 'Нажмите роль, затем Login.'
          : 'Пароль задайте вручную (VITE_DEMO_PASSWORD не задан).'}
      </Typography>
    </div>
  )
}
