import { PencilIcon, PlusIcon, TrashIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChipColor, FindingStatusItem, ProjectDetail } from '@ordiks-survey/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ConfirmDeleteDialog, SectionCard, StatusChip, UserAvatar } from '@/components/survey'
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
import { Textarea } from '@/components/ui/textarea'
import { useSurveyProject } from '../use-survey-project'
import {
  displayNameOf,
  formatDateRu,
  MEMBER_ROLE_LABELS,
  ORG_ROLE_LABELS,
  PROJECT_STATUS_META,
} from '../model'
import { useUpdateProjectMutation } from '../queries'

const CHIP_COLORS: readonly ChipColor[] = ['gray', 'blue', 'purple', 'amber', 'red', 'green']
const CHIP_COLOR_LABELS: Record<ChipColor, string> = {
  gray: 'Серый',
  blue: 'Синий',
  purple: 'Фиолетовый',
  amber: 'Янтарный',
  red: 'Красный',
  green: 'Зелёный',
}

/**
 * Паспорт проекта: реквизиты, границы/цели, цеха, кастомные поля, участники и справочники
 * (статусы находок, категории, приоритеты, типы фактов). Редактирование — только команда.
 */
export function PassportPage() {
  const { detail, isDetailLoading, viewRole } = useSurveyProject()
  const canEdit = viewRole === 'team'
  const [editing, setEditing] = useState(false)

  if (isDetailLoading && !detail) {
    return (
      <PageContainer>
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем паспорт…
        </Typography>
      </PageContainer>
    )
  }
  if (!detail) {
    return (
      <PageContainer>
        <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
          Не удалось загрузить паспорт проекта.
        </Typography>
      </PageContainer>
    )
  }

  const statusMeta = PROJECT_STATUS_META[detail.status]

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button data-testid="passport-edit-open" onClick={() => setEditing(true)}>
              <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
              Редактировать
            </Button>
          ) : undefined
        }
        description={[detail.client || null, detail.city || null].filter(Boolean).join(' · ')}
        title={detail.name}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusChip color={statusMeta.color}>{statusMeta.label}</StatusChip>
        <StatusChip outline>создан {formatDateRu(detail.createdAt)}</StatusChip>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard title="Реквизиты">
          <dl className="grid gap-3">
            <PassportRow label="Заказчик">{detail.client || '—'}</PassportRow>
            <PassportRow label="Город">{detail.city || '—'}</PassportRow>
            <PassportRow label="Границы обследования">{detail.boundaries || '—'}</PassportRow>
            <PassportRow label="Цели">{detail.goals || '—'}</PassportRow>
            {detail.settings.passportFields.map((field) => (
              <PassportRow key={field.id} label={field.name}>
                {detail.settings.passportValues[field.id] || '—'}
              </PassportRow>
            ))}
          </dl>
        </SectionCard>

        <SectionCard description="Площадки, которые попадают в обследование" title="Цеха и подразделения">
          {detail.shops.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">Не заданы.</Typography>
          ) : (
            <div className="flex flex-wrap gap-1.5" data-testid="passport-shops">
              {detail.shops.map((shop) => (
                <StatusChip key={shop} outline>
                  {shop}
                </StatusChip>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        description="Команда ОРДИКС и представители заказчика"
        title={`Участники (${detail.members.length})`}
      >
        <div className="grid gap-2 sm:grid-cols-2" data-testid="passport-members">
          {detail.members.map((member) => (
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2" key={member.id}>
              <UserAvatar email={member.email} name={member.displayName} />
              <div className="min-w-0 flex-1">
                <Typography as="p" truncate variant="bodySmMedium">
                  {displayNameOf(member.displayName, member.email)}
                </Typography>
                <Typography as="p" tone="muted" truncate variant="caption">
                  {member.email}
                </Typography>
              </div>
              <StatusChip color="blue">{MEMBER_ROLE_LABELS[member.role]}</StatusChip>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard
          description="Цвет чипа задаётся здесь; находки используют этот справочник"
          title="Статусы находок"
        >
          <div className="flex flex-wrap gap-1.5" data-testid="passport-finding-statuses">
            {detail.settings.findingStatuses.map((status) => (
              <StatusChip color={status.color} key={status.id}>
                {status.name}
              </StatusChip>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Категории, приоритеты и типы фактов">
          <div className="grid gap-3">
            <PassportRow label="Категории находок">
              <div className="flex flex-wrap gap-1.5">
                {detail.settings.findingCategories.map((category) => (
                  <StatusChip key={category} outline>
                    {category}
                  </StatusChip>
                ))}
              </div>
            </PassportRow>
            <PassportRow label="Приоритеты">
              <div className="flex flex-wrap gap-1.5">
                {detail.settings.findingPriorities.map((priority) => (
                  <StatusChip key={priority} outline>
                    {priority}
                  </StatusChip>
                ))}
              </div>
            </PassportRow>
            <PassportRow label="Типы фактов">
              <div className="flex flex-wrap gap-1.5">
                {detail.settings.factTypes.map((type) => (
                  <StatusChip color={type.color} key={type.key}>
                    {type.name}
                  </StatusChip>
                ))}
              </div>
            </PassportRow>
          </div>
          {/* TODO(F2): редактор типов фактов (kind/icon) — вместе с экраном фактов. */}
        </SectionCard>
      </div>

      {canEdit ? (
        <PassportEditDialog
          detail={detail}
          onOpenChange={(open) => {
            if (!open) setEditing(false)
          }}
          open={editing}
        />
      ) : null}
    </PageContainer>
  )
}

function PassportRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-3">
      <dt>
        <Typography as="span" tone="muted" variant="bodySm">{label}</Typography>
      </dt>
      <dd className="min-w-0">
        <Typography as="span" className="whitespace-pre-wrap" variant="bodySm">
          {children}
        </Typography>
      </dd>
    </div>
  )
}

function PassportEditDialog({
  detail,
  onOpenChange,
  open,
}: {
  detail: ProjectDetail
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const update = useUpdateProjectMutation()
  const [name, setName] = useState(detail.name)
  const [client, setClient] = useState(detail.client)
  const [city, setCity] = useState(detail.city)
  const [shops, setShops] = useState(detail.shops.join('\n'))
  const [boundaries, setBoundaries] = useState(detail.boundaries)
  const [goals, setGoals] = useState(detail.goals)
  const [statuses, setStatuses] = useState<FindingStatusItem[]>(detail.settings.findingStatuses)
  const [categories, setCategories] = useState(detail.settings.findingCategories.join('\n'))
  const [priorities, setPriorities] = useState(detail.settings.findingPriorities.join('\n'))
  const [passportValues, setPassportValues] = useState<Record<string, string>>(
    detail.settings.passportValues,
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmingStatus, setConfirmingStatus] = useState<FindingStatusItem | null>(null)
  const [statusDraft, setStatusDraft] = useState<{ name: string; color: ChipColor }>({
    name: '',
    color: 'gray',
  })

  const submit = () => {
    setError(null)
    if (name.trim().length < 2) {
      setError('Название проекта — минимум 2 символа.')
      return
    }
    const statusIds = new Set(statuses.map((status) => status.id))
    if (statusIds.size !== statuses.length) {
      setError('Идентификаторы статусов находок должны быть уникальны.')
      return
    }
    update.mutate(
      {
        projectId: detail.id,
        input: {
          name: name.trim(),
          client: client.trim(),
          city: city.trim(),
          shops: shops
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          boundaries: boundaries.trim(),
          goals: goals.trim(),
          settings: {
            findingCategories: categories
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
            findingPriorities: priorities
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
            findingStatuses: statuses,
            factTypes: detail.settings.factTypes,
            passportFields: detail.settings.passportFields,
            passportValues,
          },
        },
      },
      {
        onSuccess: () => {
          toast.success('Паспорт сохранён')
          onOpenChange(false)
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Паспорт проекта</DialogTitle>
          <DialogDescription>
            Реквизиты и справочники. Роль {ORG_ROLE_LABELS.owner.toLowerCase()} может менять всё.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="passport-name">Название *</FieldLabel>
              <Input
                data-testid="passport-name"
                id="passport-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="passport-client">Заказчик</FieldLabel>
              <Input
                id="passport-client"
                onChange={(event) => setClient(event.target.value)}
                value={client}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="passport-city">Город</FieldLabel>
              <Input
                id="passport-city"
                onChange={(event) => setCity(event.target.value)}
                value={city}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="passport-shops">Цеха (по одному в строке)</FieldLabel>
              <Textarea
                id="passport-shops"
                onChange={(event) => setShops(event.target.value)}
                value={shops}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="passport-boundaries">Границы обследования</FieldLabel>
            <Textarea
              id="passport-boundaries"
              onChange={(event) => setBoundaries(event.target.value)}
              value={boundaries}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="passport-goals">Цели</FieldLabel>
            <Textarea
              id="passport-goals"
              onChange={(event) => setGoals(event.target.value)}
              value={goals}
            />
          </Field>

          {detail.settings.passportFields.length > 0 ? (
            <FieldGroup>
              {detail.settings.passportFields.map((field) => (
                <Field key={field.id}>
                  <FieldLabel htmlFor={`passport-value-${field.id}`}>{field.name}</FieldLabel>
                  {field.type === 'select' && field.opts ? (
                    <Select
                      onValueChange={(value) =>
                        setPassportValues((prev) => ({ ...prev, [field.id]: value }))
                      }
                      value={passportValues[field.id] ?? ''}
                    >
                      <SelectTrigger id={`passport-value-${field.id}`}>
                        <SelectValue placeholder="Не задано" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.opts.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`passport-value-${field.id}`}
                      onChange={(event) =>
                        setPassportValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                      }
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                      value={passportValues[field.id] ?? ''}
                    />
                  )}
                </Field>
              ))}
            </FieldGroup>
          ) : null}

          <div className="rounded-lg border p-3">
            <Typography
              as="p"
              className="mb-2 uppercase"
              tone="muted"
              variant="controlXs"
            >
              Статусы находок
            </Typography>
            <div className="mb-2 flex flex-wrap gap-1.5" data-testid="passport-statuses-editor">
              {statuses.map((status) => (
                <span
                  className="inline-flex items-center gap-1"
                  data-testid={`passport-status-${status.id}`}
                  key={status.id}
                >
                  <StatusChip color={status.color}>{status.name}</StatusChip>
                  <Button
                    aria-label={`Удалить статус «${status.name}»`}
                    onClick={() => setConfirmingStatus(status)}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
                  </Button>
                </span>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Field className="flex-1">
                <FieldLabel htmlFor="passport-status-name">Новый статус</FieldLabel>
                <Input
                  id="passport-status-name"
                  onChange={(event) =>
                    setStatusDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  value={statusDraft.name}
                />
              </Field>
              <Field>
                <FieldLabel>Цвет</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    setStatusDraft((prev) => ({ ...prev, color: value as ChipColor }))
                  }
                  value={statusDraft.color}
                >
                  <SelectTrigger aria-label="Цвет статуса" className="w-[130px]">
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
                data-testid="passport-status-add"
                onClick={() => {
                  const label = statusDraft.name.trim()
                  if (!label) return
                  const id =
                    label
                      .toLowerCase()
                      .replace(/[^a-zа-яё0-9]+/gi, '-')
                      .replace(/^-+|-+$/g, '') || `status-${statuses.length + 1}`
                  if (statuses.some((status) => status.id === id)) {
                    setError('Статус с таким именем уже есть.')
                    return
                  }
                  setStatuses((prev) => [...prev, { id, name: label, color: statusDraft.color }])
                  setStatusDraft({ name: '', color: 'gray' })
                  setError(null)
                }}
                size="sm"
                variant="outline"
              >
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Добавить
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="passport-categories">Категории (по одной в строке)</FieldLabel>
              <Textarea
                id="passport-categories"
                onChange={(event) => setCategories(event.target.value)}
                value={categories}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="passport-priorities">Приоритеты (по одному в строке)</FieldLabel>
              <Textarea
                id="passport-priorities"
                onChange={(event) => setPriorities(event.target.value)}
                value={priorities}
              />
            </Field>
          </div>

          {error ? (
            <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
              {error}
            </Typography>
          ) : null}
        </FieldGroup>
        <ConfirmDeleteDialog
          description="Если статус используется в находках, сервер отклонит сохранение — покажем его ошибку."
          onConfirm={() => {
            if (!confirmingStatus) return
            setStatuses((prev) => prev.filter((item) => item.id !== confirmingStatus.id))
            setConfirmingStatus(null)
          }}
          onOpenChange={(open) => {
            if (!open) setConfirmingStatus(null)
          }}
          open={confirmingStatus !== null}
          title={confirmingStatus ? `Удалить статус «${confirmingStatus.name}»?` : ''}
        />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Отмена
          </Button>
          <Button data-testid="passport-submit" disabled={update.isPending} onClick={submit}>
            {update.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
