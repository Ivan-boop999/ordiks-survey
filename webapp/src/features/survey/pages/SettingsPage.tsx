import {
  Copy01Icon,
  Download01Icon,
  PlusIcon,
  TrashIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChipColor, FactType, InviteDto, MemberRole } from '@ordiks-survey/contracts'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ColorDot, ConfirmDeleteDialog, SectionCard, StatusChip, UserAvatar } from '@/components/survey'
import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth'
import { getAdminUsers } from '@/features/admin'
import {
  formatDateTimeRu,
  MEMBER_ROLE_LABELS,
  ORG_ROLE_LABELS,
  displayNameOf,
} from '../model'
import {
  inviteLinkUrl,
  inviteManagePayload,
  type InviteManageFormValues,
} from '../invite-model'
import {
  CHIP_COLORS,
  CHIP_COLOR_LABELS,
  dictionaryDraft,
  factTypeKeyFor,
  setFactTypeColor,
  setStatusColor,
  setStatusName,
  settingsFromDraft,
  statusIdFor,
  type DictionaryDraft,
} from '../settings-model'
import {
  useAddProjectMemberMutation,
  useCreateInviteMutation,
  useDeactivateInviteMutation,
  useInvitesQuery,
  useMembersQuery,
  useRemoveProjectMemberMutation,
  useUpdateProjectMutation,
  useUpdateProjectMemberMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

/** Настройки проекта (только команда ОРДИКС): участники, приглашения, справочники, данные. */
export function SettingsPage() {
  // Управляемый таб: кнопка «Пригласить участника» из «Участников» открывает «Приглашения».
  const [tab, setTab] = useState('members')
  const [inviteNoteSeed, setInviteNoteSeed] = useState<string | null>(null)

  return (
    <PageContainer>
      <PageHeader
        description="Состав проекта, приглашения по коду и справочники статусов. Клиентский портал эти разделы не видит."
        title="Настройки проекта"
      />
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value="members">Участники</TabsTrigger>
          <TabsTrigger value="invites">Приглашения</TabsTrigger>
          <TabsTrigger value="dictionaries">Справочники</TabsTrigger>
          <TabsTrigger value="data">Данные</TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <MembersTab
            onInvite={() => {
              setInviteNoteSeed('Участник обследования')
              setTab('invites')
            }}
          />
        </TabsContent>
        <TabsContent value="invites">
          <InvitesTab
            noteSeed={inviteNoteSeed}
            onNoteSeedConsumed={() => setInviteNoteSeed(null)}
          />
        </TabsContent>
        <TabsContent value="dictionaries">
          <DictionariesTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

// ============================================================
// Участники
// ============================================================

function MembersTab({ onInvite }: { onInvite: (note: string) => void }) {
  const { projectId } = useSurveyProject()
  const membersQuery = useMembersQuery(projectId)
  const [adding, setAdding] = useState(false)
  const members = membersQuery.data?.items ?? []

  return (
    <SectionCard
      description="Команда ОРДИКС и представители заказчика. Смена роли влияет на доступ в проекте."
      title={`Участники (${members.length})`}
      actions={
        <Button data-testid="member-add-open" onClick={() => setAdding(true)} size="sm">
          <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} />
          Добавить
        </Button>
      }
    >
      {membersQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем участников…
        </Typography>
      ) : members.length === 0 ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Участников нет.
        </Typography>
      ) : (
        <div className="grid gap-2" data-testid="settings-members">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </div>
      )}
      {adding ? (
        <AddMemberDialog
          onInvite={() => onInvite('Участник обследования')}
          onOpenChange={(open) => {
            if (!open) setAdding(false)
          }}
          open
        />
      ) : null}
    </SectionCard>
  )
}

function MemberRow({
  member,
}: {
  member: { id: string; userId: string; role: MemberRole; email: string; displayName: string | null }
}) {
  const auth = useAuth()
  const { projectId } = useSurveyProject()
  const updateRole = useUpdateProjectMemberMutation(projectId)
  const remove = useRemoveProjectMemberMutation(projectId)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [confirmingDowngrade, setConfirmingDowngrade] = useState<MemberRole | null>(null)
  const isSelf = auth.user?.id === member.userId

  const applyRole = (role: MemberRole) =>
    updateRole.mutate(
      { memberId: member.id, role },
      {
        onSuccess: () => {
          toast.success('Роль обновлена')
          setConfirmingDowngrade(null)
        },
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2" data-testid="member-row">
      <UserAvatar email={member.email} name={member.displayName} />
      <div className="min-w-0 flex-1">
        <Typography as="p" truncate variant="bodySmMedium">
          {displayNameOf(member.displayName, member.email)}
          {isSelf ? ' (вы)' : ''}
        </Typography>
        <Typography as="p" tone="muted" truncate variant="caption">
          {member.email}
        </Typography>
      </div>
      <Select
        onValueChange={(role) => {
          // Понижение прав — с подтверждением, повышение и равная роль — сразу.
          if (MEMBER_ROLE_RANK[role as MemberRole] > MEMBER_ROLE_RANK[member.role]) {
            setConfirmingDowngrade(role as MemberRole)
            return
          }
          applyRole(role as MemberRole)
        }}
        value={member.role}
      >
        <SelectTrigger aria-label={`Роль ${member.email}`} className="w-[210px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(MEMBER_ROLE_LABELS) as MemberRole[]).map((role) => (
            <SelectItem key={role} value={role}>
              {MEMBER_ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isSelf ? (
        <span className="w-9" />
      ) : (
        <Button
          aria-label={`Удалить участника ${member.email}`}
          onClick={() => setConfirmingRemove(true)}
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
        </Button>
      )}
      <ConfirmDeleteDialog
        confirmLabel="Исключить"
        description="Доступ к проекту будет отозван."
        onConfirm={() =>
          remove.mutate(member.id, {
            onSuccess: () => {
              toast.success('Участник удалён')
              setConfirmingRemove(false)
            },
            onError: (error) => toast.error(error.message),
          })
        }
        onOpenChange={setConfirmingRemove}
        open={confirmingRemove}
        pending={remove.isPending}
        title={`Исключить ${displayNameOf(member.displayName, member.email)} из проекта?`}
      />
      <ConfirmDeleteDialog
        confirmLabel="Понизить роль"
        destructive={false}
        description={`Роль сменится с «${MEMBER_ROLE_LABELS[member.role]}» на «${
          confirmingDowngrade ? MEMBER_ROLE_LABELS[confirmingDowngrade] : ''
        }».`}
        onConfirm={() => {
          if (confirmingDowngrade) applyRole(confirmingDowngrade)
        }}
        onOpenChange={(open) => {
          if (!open) setConfirmingDowngrade(null)
        }}
        open={confirmingDowngrade !== null}
        title="Понизить права участника?"
      />
    </div>
  )
}

/** Ранг роли для распознавания понижения прав (меньше — шире права). */
const MEMBER_ROLE_RANK: Record<MemberRole, number> = {
  manager: 0,
  analyst: 1,
  client_lead: 2,
  client_staff: 3,
  observer: 4,
}

function AddMemberDialog({
  open,
  onInvite,
  onOpenChange,
}: {
  open: boolean
  onInvite: (note: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const auth = useAuth()
  const { projectId } = useSurveyProject()
  const addMember = useAddProjectMemberMutation(projectId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('client_lead')
  const [error, setError] = useState<string | null>(null)

  // Поиск пользователя по email — через справочник администратора: другой публичной
  // картинки «пользователи» у API нет. Владельцу организации и РП он закрыт (403), поэтому
  // им показываем рабочий сценарий — приглашение (аудит: «Добавить участника» не работал).
  const canLookup = auth.user?.role === 'admin'

  if (!canLookup) {
    return (
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить участника</DialogTitle>
            <DialogDescription>
              Добавление по email доступно только администратору системы. Для команды
              и заказчика используйте приглашение: код создаёт аккаунт с нужной ролью
              и сразу добавляет принявшего в этот проект.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Отмена
            </Button>
            <Button
              data-testid="member-invite-cta"
              onClick={() => {
                onOpenChange(false)
                onInvite('Участник обследования')
              }}
            >
              <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} />
              Пригласить участника
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const submit = async () => {
    setError(null)
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Укажите email существующего пользователя.')
      return
    }
    try {
      const directory = await getAdminUsers(auth.transport, { q: trimmed, page: 1, pageSize: 20 })
      const found = directory.items.find(
        (user) => user.email.toLowerCase() === trimmed.toLowerCase(),
      )
      if (!found) {
        setError('Пользователь с такой почтой не найден. Пошлите приглашение — регистрация по коду.')
        return
      }
      addMember.mutate(
        { userId: found.id, role },
        {
          onSuccess: () => {
            toast.success(`${found.email} добавлен в проект`)
            onOpenChange(false)
            setEmail('')
          },
          onError: (mutationError) => setError(mutationError.message),
        },
      )
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Не удалось найти пользователя')
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить участника</DialogTitle>
          <DialogDescription>
            Существующий пользователь по email. Новым людям создайте приглашение — вкладка «Приглашения».
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="member-email">Email *</FieldLabel>
            <Input
              data-testid="member-email"
              id="member-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ivanov@zavod.ru"
              value={email}
            />
          </Field>
          <Field>
            <FieldLabel>Роль в проекте</FieldLabel>
            <Select onValueChange={(value) => setRole(value as MemberRole)} value={role}>
              <SelectTrigger aria-label="Роль в проекте" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MEMBER_ROLE_LABELS) as MemberRole[]).map((memberRole) => (
                  <SelectItem key={memberRole} value={memberRole}>
                    {MEMBER_ROLE_LABELS[memberRole]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {error ? (
            <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
              {error}
            </Typography>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Отмена
          </Button>
          <Button data-testid="member-add-submit" disabled={addMember.isPending} onClick={submit}>
            {addMember.isPending ? 'Добавляем…' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Приглашения
// ============================================================

function InvitesTab({
  noteSeed,
  onNoteSeedConsumed,
}: {
  noteSeed: string | null
  onNoteSeedConsumed: () => void
}) {
  const invitesQuery = useInvitesQuery()
  // Переход «Пригласить участника» из вкладки «Участники»: сид открывает диалог создания
  // с предзаполненным примечанием. Корректировка при рендере (без эффекта): повторный
  // сид при уже открытой вкладке тоже срабатывает; гасится сид закрытием диалога.
  const [creating, setCreating] = useState(noteSeed !== null)
  const [initialNote, setInitialNote] = useState(noteSeed ?? '')
  const [lastSeed, setLastSeed] = useState<string | null>(noteSeed)
  if (noteSeed !== lastSeed) {
    setLastSeed(noteSeed)
    setInitialNote(noteSeed ?? '')
    setCreating(noteSeed !== null)
  }
  const invites = invitesQuery.data?.items ?? []

  return (
    <SectionCard
      actions={
        <Button data-testid="invite-create-open" onClick={() => setCreating(true)} size="sm">
          <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
          Приглашение
        </Button>
      }
      description="Код-ссылка для входа: задаёт глобальную роль и (по желанию) роль в этом проекте."
      title="Приглашения"
    >
      {invitesQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем приглашения…
        </Typography>
      ) : invites.length === 0 ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Приглашений ещё нет.
        </Typography>
      ) : (
        <div className="grid gap-2" data-testid="settings-invites">
          {invites.map((invite) => (
            <InviteRow invite={invite} key={invite.id} />
          ))}
        </div>
      )}
      {creating ? (
        <InviteCreateDialog
          initialNote={initialNote}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false)
              onNoteSeedConsumed()
            }
          }}
          open
        />
      ) : null}
    </SectionCard>
  )
}

function inviteState(invite: InviteDto): { label: string; color: ChipColor } {
  if (invite.usedAt) return { label: 'Использовано', color: 'green' }
  if (!invite.active) return { label: 'Отключено', color: 'gray' }
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    return { label: 'Истекло', color: 'red' }
  }
  return { label: 'Активно', color: 'blue' }
}

function InviteRow({ invite }: { invite: InviteDto }) {
  const deactivate = useDeactivateInviteMutation()
  const state = inviteState(invite)
  const isActive = !invite.usedAt && invite.active

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" data-testid="invite-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Typography as="span" variant="code">
            {invite.code}
          </Typography>
          <StatusChip color={state.color}>{state.label}</StatusChip>
        </div>
        <Typography as="p" tone="muted" truncate variant="caption">
          {ORG_ROLE_LABELS[invite.orgRole]}
          {invite.memberRole ? ` · ${MEMBER_ROLE_LABELS[invite.memberRole]} в проекте` : ''}
          {invite.note ? ` · ${invite.note}` : ''}
          {invite.usedAt ? ` · использовано ${formatDateTimeRu(invite.usedAt)}` : ''}
        </Typography>
      </div>
      {isActive ? (
        <Button
          aria-label={`Скопировать ссылку приглашения ${invite.code}`}
          onClick={() => copyText(inviteLinkUrl(invite.code, window.location.origin))}
          size="sm"
          variant="outline"
        >
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          Ссылка
        </Button>
      ) : null}
      {isActive ? (
        <Button
          aria-label={`Отключить приглашение ${invite.code}`}
          disabled={deactivate.isPending}
          onClick={() =>
            deactivate.mutate(invite.id, {
              onSuccess: () => toast.success('Приглашение отключено'),
              onError: (error) => toast.error(error.message),
            })
          }
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
        </Button>
      ) : null}
    </div>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Скопировано в буфер')
  } catch {
    toast.error('Не удалось скопировать — выделите код вручную')
  }
}

function InviteCreateDialog({
  initialNote = '',
  open,
  onOpenChange,
}: {
  initialNote?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { projectId } = useSurveyProject()
  const createInvite = useCreateInviteMutation()
  const [created, setCreated] = useState<InviteDto | null>(null)
  const [values, setValues] = useState<InviteManageFormValues>({
    orgRole: 'client',
    withProject: true,
    memberRole: 'client_lead',
    note: initialNote,
  })
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    const result = inviteManagePayload(values, projectId)
    if (result.payload === null) {
      setError(Object.values(result.errors)[0] ?? 'Проверьте форму')
      return
    }
    createInvite.mutate(result.payload, {
      onSuccess: (invite) => {
        setCreated(invite)
      },
      onError: (mutationError) => setError(mutationError.message),
    })
  }

  if (created) {
    const link = inviteLinkUrl(created.code, window.location.origin)
    return (
      <Dialog
        onOpenChange={(openValue) => {
          if (!openValue) {
            setCreated(null)
            onOpenChange(false)
          }
        }}
        open={open}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Приглашение создано</DialogTitle>
            <DialogDescription>
              Отправьте ссылку или код — регистрация по ним создаёт аккаунт с нужной ролью.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3" data-testid="invite-created">
            <div className="rounded-xl border bg-muted/40 p-4 text-center">
              <Typography as="p" data-testid="invite-created-code" variant="h3" wrap="break">
                {created.code}
              </Typography>
            </div>
            <Field>
              <FieldLabel htmlFor="invite-link">Ссылка для входа</FieldLabel>
              <Input id="invite-link" readOnly value={link} />
            </Field>
          </div>
          <DialogFooter>
            <Button onClick={() => copyText(created.code)} variant="outline">
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              Копировать код
            </Button>
            <Button data-testid="invite-copy-link" onClick={() => copyText(link)}>
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              Копировать ссылку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новое приглашение</DialogTitle>
          <DialogDescription>
            Код создаётся автоматически. Роль в организации задаётся всем, роль в проекте — только этому проекту.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Роль в организации</FieldLabel>
            <Select
              onValueChange={(orgRole) => setValues((prev) => ({ ...prev, orgRole: orgRole as InviteManageFormValues['orgRole'] }))}
              value={values.orgRole}
            >
              <SelectTrigger aria-label="Роль в организации" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ORG_ROLE_LABELS) as InviteManageFormValues['orgRole'][]).map((orgRole) => (
                  <SelectItem key={orgRole} value={orgRole}>
                    {ORG_ROLE_LABELS[orgRole]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch
              checked={values.withProject}
              id="invite-with-project"
              onCheckedChange={(checked) => setValues((prev) => ({ ...prev, withProject: checked }))}
            />
            <label className="flex-1 cursor-pointer" htmlFor="invite-with-project">
              <Typography as="span" variant="bodySm">
                Добавить принявшего в этот проект
              </Typography>
            </label>
          </div>
          {values.withProject ? (
            <Field>
              <FieldLabel>Роль в проекте</FieldLabel>
              <Select
                onValueChange={(memberRole) => setValues((prev) => ({ ...prev, memberRole: memberRole as MemberRole }))}
                value={values.memberRole}
              >
                <SelectTrigger aria-label="Роль в проекте" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MEMBER_ROLE_LABELS) as MemberRole[]).map((memberRole) => (
                    <SelectItem key={memberRole} value={memberRole}>
                      {MEMBER_ROLE_LABELS[memberRole]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="invite-note">Примечание (для себя)</FieldLabel>
            <Textarea
              id="invite-note"
              onChange={(event) => setValues((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="Для главного технолога завода"
              rows={2}
              value={values.note}
            />
          </Field>
          {error ? (
            <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
              {error}
            </Typography>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Отмена
          </Button>
          <Button data-testid="invite-create-submit" disabled={createInvite.isPending} onClick={submit}>
            {createInvite.isPending ? 'Создаём…' : 'Создать приглашение'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Справочники
// ============================================================

function DictionariesTab() {
  const { detail, isDetailLoading } = useSurveyProject()
  const update = useUpdateProjectMutation()
  const [draft, setDraft] = useState<DictionaryDraft | null>(null)
  const [statusName, setStatusNameValue] = useState('')
  const [statusColor, setStatusColorValue] = useState<ChipColor>('gray')
  // Отдельные состояния для «нового статуса» и «нового типа факта»: общий useState
  // зеркалил текст между двумя несвязанными полями (аудит: баг справочников).
  const [factTypeName, setFactTypeName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const active = useMemo(
    () => (detail && draft === null ? dictionaryDraft(detail.settings) : draft),
    [detail, draft],
  )

  if (isDetailLoading && !detail) {
    return (
      <Typography as="p" tone="muted" variant="bodySm">
        Загружаем справочники…
      </Typography>
    )
  }
  if (!detail || !active) {
    return (
      <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
        Не удалось загрузить проект.
      </Typography>
    )
  }

  const save = () => {
    setError(null)
    const result = settingsFromDraft(active, detail.settings)
    if (result.settings === null) {
      setError(Object.values(result.errors)[0] ?? 'Проверьте справочники')
      return
    }
    update.mutate(
      { projectId: detail.id, input: { settings: result.settings } },
      {
        onSuccess: () => {
          toast.success('Справочники сохранены')
          setDraft(null)
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <SectionCard
        description="Цвет чипа используется реестром находок; id статуса хранится в находках"
        title="Статусы находок"
      >
        <div className="grid gap-1.5" data-testid="settings-statuses">
          {active.statuses.map((status) => (
            <div className="flex items-center gap-2" data-testid={`settings-status-${status.id}`} key={status.id}>
              <ColorDot color={status.color} />
              <Input
                aria-label={`Название статуса ${status.name}`}
                className="h-8 flex-1"
                onChange={(event) =>
                  setDraft({
                    ...active,
                    statuses: setStatusName(active.statuses, status.id, event.target.value),
                  })
                }
                value={status.name}
              />
              <Select
                onValueChange={(color) =>
                  setDraft({
                    ...active,
                    statuses: setStatusColor(active.statuses, status.id, color as ChipColor),
                  })
                }
                value={status.color}
              >
                <SelectTrigger aria-label={`Цвет статуса ${status.name}`} className="h-8 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHIP_COLORS.map((color) => (
                    <SelectItem key={color} value={color}>
                      {CHIP_COLOR_LABELS[color]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                aria-label={`Удалить статус ${status.name}`}
                onClick={() =>
                  setDraft({ ...active, statuses: active.statuses.filter((item) => item.id !== status.id) })
                }
                size="icon-sm"
                variant="ghost"
              >
                <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <Field className="flex-1">
            <FieldLabel htmlFor="status-new-name">Новый статус</FieldLabel>
            <Input
              data-testid="status-new-name"
              id="status-new-name"
              onChange={(event) => setStatusNameValue(event.target.value)}
              value={statusName}
            />
          </Field>
          <Field>
            <FieldLabel>Цвет</FieldLabel>
            <Select
              onValueChange={(color) => setStatusColorValue(color as ChipColor)}
              value={statusColor}
            >
              <SelectTrigger aria-label="Цвет нового статуса" className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHIP_COLORS.map((color) => (
                  <SelectItem key={color} value={color}>
                    {CHIP_COLOR_LABELS[color]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            data-testid="status-add"
            onClick={() => {
              const name = statusName.trim()
              if (!name) return
              const id = statusIdFor(name, active.statuses)
              setDraft({ ...active, statuses: [...active.statuses, { id, name, color: statusColor }] })
              setStatusNameValue('')
              setStatusColorValue('gray')
            }}
            size="sm"
            variant="outline"
          >
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Добавить
          </Button>
        </div>
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard description="Простой список: по одному значению в строке" title="Категории и приоритеты">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="categories">Категории находок</FieldLabel>
              <Textarea
                id="categories"
                onChange={(event) => setDraft({ ...active, categoriesText: event.target.value })}
                rows={4}
                value={active.categoriesText}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="priorities">Приоритеты</FieldLabel>
              <Textarea
                id="priorities"
                onChange={(event) => setDraft({ ...active, prioritiesText: event.target.value })}
                rows={4}
                value={active.prioritiesText}
              />
            </Field>
          </FieldGroup>
        </SectionCard>

        <SectionCard description="Типы фактов: фото, файлы и заметки реестра фактов" title="Типы фактов">
          <div className="grid gap-1.5" data-testid="settings-fact-types">
            {active.factTypes.map((type) => (
              <div className="flex items-center gap-2" data-testid={`settings-fact-type-${type.key}`} key={type.key}>
                <ColorDot color={type.color} />
                <Input
                  aria-label={`Название типа ${type.name}`}
                  className="h-8 flex-1"
                  onChange={(event) =>
                    setDraft({
                      ...active,
                      factTypes: active.factTypes.map((item) =>
                        item.key === type.key
                          ? { ...item, name: event.target.value.trim() || item.name }
                          : item,
                      ),
                    })
                  }
                  value={type.name}
                />
                <Select
                  onValueChange={(color) =>
                    setDraft({
                      ...active,
                      factTypes: setFactTypeColor(active.factTypes, type.key, color as ChipColor),
                    })
                  }
                  value={type.color}
                >
                  <SelectTrigger aria-label={`Цвет типа ${type.name}`} className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHIP_COLORS.map((color) => (
                      <SelectItem key={color} value={color}>
                        {CHIP_COLOR_LABELS[color]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  aria-label={`Удалить тип ${type.name}`}
                  onClick={() =>
                    setDraft({ ...active, factTypes: active.factTypes.filter((item) => item.key !== type.key) })
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel htmlFor="fact-type-new-name">Новый тип</FieldLabel>
              <Input
                data-testid="fact-type-new-name"
                id="fact-type-new-name"
                onChange={(event) => setFactTypeName(event.target.value)}
                placeholder="Видео"
                value={factTypeName}
              />
            </Field>
            <Button
              onClick={() => {
                const name = factTypeName.trim()
                if (!name) return
                const key = factTypeKeyFor(name, active.factTypes)
                const next: FactType = { key, name, kind: 'note', icon: 'note', color: 'gray' }
                setDraft({ ...active, factTypes: [...active.factTypes, next] })
                setFactTypeName('')
              }}
              size="sm"
              variant="outline"
            >
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Добавить
            </Button>
          </div>
        </SectionCard>
      </div>

      {error ? (
        <div className="lg:col-span-2">
          <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
            {error}
          </Typography>
        </div>
      ) : null}
      <div className="lg:col-span-2">
        <Button data-testid="dictionaries-save" disabled={update.isPending} onClick={save}>
          {update.isPending ? 'Сохраняем…' : 'Сохранить справочники'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Данные
// ============================================================

function DataTab() {
  const { detail } = useSurveyProject()

  const exportJson = () => {
    if (!detail) return
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `project-${detail.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('Паспорт проекта выгружен в JSON')
  }

  return (
    <SectionCard
      description="Выгрузка данных проекта для бэкапа и передачи. Полный экспорт (находки, факты, интервью) появится с отчётом."
      title="Экспорт данных"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button data-testid="project-export" disabled={!detail} onClick={exportJson}>
          <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
          Скачать JSON проекта
        </Button>
        <Typography as="span" tone="muted" variant="caption">
          Паспорт, участники и справочники (GET /api/projects/:id)
        </Typography>
      </div>
    </SectionCard>
  )
}
