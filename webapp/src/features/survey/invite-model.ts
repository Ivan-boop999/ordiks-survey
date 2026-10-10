import {
  acceptInviteRequestSchema,
  createInviteRequestSchema,
  type AcceptInviteRequest,
  type CreateInviteRequest,
  type MemberRole,
  type OrgRole,
} from '@ordiks-survey/contracts'

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

// ============================================================
// Управление приглашениями (вкладка «Приглашения» настроек)
// ============================================================

export type InviteManageFormValues = {
  orgRole: OrgRole
  /** Добавить принявшего в этот проект с ролью memberRole (projectId задаётся страницей). */
  withProject: boolean
  memberRole: MemberRole
  note: string
}

export type InviteManageFormErrors = Partial<Record<keyof InviteManageFormValues | 'form', string>>

/**
 * Форма создания приглашения → payload POST /api/invites. Те же правила, что на сервере:
 * memberRole обязателен, когда приглашание привязано к проекту; примечание — до 500 символов.
 */
export function inviteManagePayload(
  values: InviteManageFormValues,
  projectId: string,
): { errors: InviteManageFormErrors; payload: CreateInviteRequest | null } {
  const candidate: CreateInviteRequest = {
    orgRole: values.orgRole,
    ...(values.withProject ? { projectId, memberRole: values.memberRole } : {}),
    note: values.note.trim(),
  }
  const parsed = createInviteRequestSchema.safeParse(candidate)
  if (parsed.success) return { errors: {}, payload: parsed.data }

  const errors: InviteManageFormErrors = {}
  for (const issue of parsed.error.issues) {
    const key = (issue.path[0] ?? 'form') as keyof InviteManageFormErrors
    errors[key] = issue.message
  }
  return { errors, payload: null }
}

/** Ссылка приглашения для кнопки «копировать»: /invite?code=… от текущего origin. */
export function inviteLinkUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/invite?code=${encodeURIComponent(code)}`
}
