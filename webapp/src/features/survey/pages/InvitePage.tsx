import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth'
import { ApiRequestError } from '@/platform/api'
import { PasswordInput } from '@/features/auth'
import { acceptInvite } from '../api'
import { validateInviteForm } from '../invite-model'

/**
 * Публичная страница входа по приглашению: код из ссылки (?code=…), почта, имя и пароль.
 * После создания аккаунта — автоматический вход и редирект в приложение обследования.
 */
export function InvitePage() {
  const { code: codeFromLink } = useSearch({ from: '/invite' })
  const auth = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState(codeFromLink ?? '')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const { errors, data } = validateInviteForm({ code, email, displayName, password })
    if (!data) {
      setFieldErrors(errors as Record<string, string[]>)
      return
    }
    setFieldErrors({})

    setPending(true)
    try {
      await acceptInvite(data)
      // Аккаунт создан; accept не выдаёт сессию — входим сразу после регистрации.
      await auth.login({ email: data.email, password: data.password })
      await navigate({ to: '/survey' })
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.status === 409) {
          setFormError('Пользователь с такой почтой уже существует — войдите или укажите другую.')
        } else {
          setFormError(error.message)
        }
      } else {
        setFormError('Не удалось принять приглашение. Попробуйте ещё раз.')
      }
    } finally {
      setPending(false)
    }
  }

  if (auth.user) {
    void navigate({ to: '/survey' })
    return null
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-violet-600 text-white">
            <Typography as="span" variant="controlXs">
              О
            </Typography>
          </span>
          <Typography as="span" variant="control">
            ОРДИКС Обследование
          </Typography>
        </div>
        <form
          className="grid gap-5 rounded-xl border bg-card p-6 shadow-sm"
          data-testid="invite-form"
          onSubmit={(event: React.ChangeEvent<HTMLInputElement>) => void submit(event)}
        >
          <div className="grid gap-1 text-center">
            <Typography as="h1" variant="h3">
              Вход по приглашению
            </Typography>
            <Typography variant="bodySm" tone="muted">
              Код вам прислала команда ОРДИКС. Создайте аккаунт — и попадёте в свой проект.
            </Typography>
          </div>

          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.code)}>
              <FieldLabel htmlFor="invite-code">Код приглашения *</FieldLabel>
              <Input
                aria-invalid={Boolean(fieldErrors.code)}
                data-testid="invite-code"
                id="invite-code"
                onChange={(event) => setCode(event.target.value)}
                placeholder="UFA-2026"
                value={code}
              />
              <FieldError errors={toFieldMessages(fieldErrors.code)} />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.email)}>
              <FieldLabel htmlFor="invite-email">Рабочая почта *</FieldLabel>
              <Input
                aria-invalid={Boolean(fieldErrors.email)}
                autoComplete="email"
                data-testid="invite-email"
                id="invite-email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.ru"
                type="email"
                value={email}
              />
              <FieldError errors={toFieldMessages(fieldErrors.email)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-name">Имя и фамилия</FieldLabel>
              <Input
                autoComplete="name"
                data-testid="invite-name"
                id="invite-name"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Рустем Гареев"
                value={displayName}
              />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.password)}>
              <FieldLabel htmlFor="invite-password">Пароль *</FieldLabel>
              <PasswordInput
                aria-invalid={Boolean(fieldErrors.password)}
                autoComplete="new-password"
                data-testid="invite-password"
                id="invite-password"
                onChange={(event) => setPassword(event.target.value)}
                value={password}
              />
              <FieldError errors={toFieldMessages(fieldErrors.password)} />
            </Field>
          </FieldGroup>

          {formError ? (
            <Typography
              as="p"
              className="text-red-600"
              data-testid="invite-form-error"
              role="alert"
              variant="bodySm"
            >
              {formError}
            </Typography>
          ) : null}

          <Button data-testid="invite-submit" disabled={pending || auth.isBootstrapping} type="submit">
            {pending ? 'Создаём аккаунт…' : 'Создать аккаунт и войти'}
          </Button>

          <Typography className="text-center" variant="bodySm">
            Уже есть аккаунт?{' '}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              search={{ returnTo: undefined }}
              to="/login"
            >
              Войти
            </Link>
          </Typography>
        </form>
      </div>
    </main>
  )
}

/** FieldError шаблона ждёт объекты {message}, zod отдаёт строки. */
function toFieldMessages(messages: string[] | undefined) {
  return (messages ?? []).map((message) => ({ message }))
}
