import { acceptInviteRequestSchema, type AcceptInviteRequest } from '@ordiks-survey/contracts'

export type InviteFormValues = {
  code: string
  email: string
  displayName: string
  password: string
}

export type InviteFormErrors = Partial<Record<keyof InviteFormValues | 'form', string[]>>

/**
 * Валидация формы приглашения: те же правила, что на сервере (acceptInviteRequestSchema),
 * ошибки — по полям, чтобы форма показывала их у вводов до отправки.
 */
export function validateInviteForm(values: InviteFormValues): {
  errors: InviteFormErrors
  data: AcceptInviteRequest | null
} {
  const candidate: AcceptInviteRequest = {
    code: values.code.trim(),
    email: values.email,
    password: values.password,
    ...(values.displayName.trim() ? { displayName: values.displayName.trim() } : {}),
  }
  const parsed = acceptInviteRequestSchema.safeParse(candidate)
  if (parsed.success) return { errors: {}, data: parsed.data }

  const errors: InviteFormErrors = {}
  for (const issue of parsed.error.issues) {
    const key = (issue.path[0] ?? 'form') as keyof InviteFormErrors
    errors[key] = [...(errors[key] ?? []), issue.message]
  }
  return { errors, data: null }
}
