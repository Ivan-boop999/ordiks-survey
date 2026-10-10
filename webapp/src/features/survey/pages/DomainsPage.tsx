import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { DomainDto, DomainGroupDto } from '@ordiks-survey/contracts'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ProgressBar, StatusChip, SurveyEmptyState, UserAvatar } from '@/components/survey'
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
import { useSurveyProject } from '../use-survey-project'
import { toggleChecklistDone } from '../dashboard-model'
import {
  checklistProgress,
  DOMAIN_STATUS_META,
  displayNameOf,
  percent,
} from '../model'
import {
  useCreateChecklistItemMutation,
  useCreateDomainGroupMutation,
  useCreateDomainMutation,
  useDeleteChecklistItemMutation,
  useDeleteDomainMutation,
  useDeleteDomainGroupMutation,
  useDomainGroupsQuery,
  useMembersQuery,
  useUpdateChecklistItemMutation,
  useUpdateDomainMutation,
  useUpdateDomainGroupMutation,
} from '../queries'

/**
 * Домены: дерево групп → домены с прогрессом чек-листов. Модалка домена — чек-лист
 * (галочки, добавление, порядок, удаление); статус домена сервер пересчитывает сам.
 */
export function DomainsPage() {
  const { projectId, canEdit } = useSurveyProject()
  const groupsQuery = useDomainGroupsQuery(projectId)
  const [editingDomain, setEditingDomain] = useState<DomainDto | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [addingDomain, setAddingDomain] = useState(false)

  const groups = useMemo(
    () =>
      (groupsQuery.data?.items ?? [])
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((group) => ({ ...group, domains: [...group.domains].sort((a, b) => a.sortOrder - b.sortOrder) })),
    [groupsQuery.data],
  )

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => setAddingDomain(true)} size="sm" variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Домен
              </Button>
              <Button onClick={() => setCreatingGroup(true)} size="sm" variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Группа
              </Button>
            </div>
          ) : undefined
        }
        description="Направления обследования, сгруппированные по контурам предприятия. Статус считается по чек-листу."
        title="Домены"
      />

      {groupsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем домены…
        </Typography>
      ) : groups.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setCreatingGroup(true)}>Создать первую группу</Button>
            ) : undefined
          }
          description="Структуру доменов задаёт команда ОРДИКС из шаблона проекта."
          title="Доменов пока нет"
        />
      ) : (
        <div className="grid gap-4" data-testid="domains-tree">
          {groups.map((group) => (
            <DomainGroupCard
              canEdit={canEdit}
              group={group}
              key={group.id}
              onEditDomain={setEditingDomain}
            />
          ))}
        </div>
      )}

      {canEdit && editingDomain ? (
        <ChecklistDialog
          domain={editingDomain}
          onOpenChange={(open) => {
            if (!open) setEditingDomain(null)
          }}
          open={editingDomain !== null}
        />
      ) : null}
      {canEdit ? (
        <>
          <CreateGroupDialog
            onDone={() => setCreatingGroup(false)}
            open={creatingGroup}
          />
          <AddDomainDialog
            groups={groups}
            onDone={() => setAddingDomain(false)}
            open={addingDomain}
          />
        </>
      ) : null}
    </PageContainer>
  )
}

function CreateGroupDialog({ onDone, open }: { onDone: () => void; open: boolean }) {
  const { projectId } = useSurveyProject()
  const createGroup = useCreateDomainGroupMutation(projectId)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDone()
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Новая группа доменов</DialogTitle>
          <DialogDescription>
            Группа — контур предприятия («Производство», «Качество», «ИТ»).
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="create-group-name">Название</FieldLabel>
            <Input
              id="create-group-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          {error ? (
            <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
              {error}
            </Typography>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={onDone} variant="outline">
            Отмена
          </Button>
          <Button
            data-testid="group-submit"
            disabled={createGroup.isPending || name.trim().length === 0}
            onClick={() =>
              createGroup.mutate(
                { name: name.trim() },
                {
                  onSuccess: () => {
                    toast.success('Группа создана')
                    setName('')
                    onDone()
                  },
                  onError: (mutationError) => setError(mutationError.message),
                },
              )
            }
          >
            {createGroup.isPending ? 'Создаём…' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DomainGroupCard({
  canEdit,
  group,
  onEditDomain,
}: {
  canEdit: boolean
  group: DomainGroupDto
  onEditDomain: (domain: DomainDto) => void
}) {
  const { projectId } = useSurveyProject()
  const renameGroup = useUpdateDomainGroupMutation(projectId)
  const deleteGroup = useDeleteDomainGroupMutation(projectId)
  const [renaming, setRenaming] = useState(false)
  const { detail } = useSurveyProject()

  const ownerOf = (ownerId: string | null) =>
    detail?.members.find((member) => member.userId === ownerId)

  return (
    <section className="rounded-xl border bg-card shadow-sm" data-testid={`domain-group-${group.id}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <Typography as="h2" truncate variant="control">
          {group.name}
        </Typography>
        <div className="flex items-center gap-1">
          <Typography as="span" tone="muted" variant="caption">
            доменов: {group.domains.length}
          </Typography>
          {canEdit ? (
            <>
              <Button
                aria-label={`Переименовать группу «${group.name}»`}
                onClick={() => setRenaming(true)}
                size="icon-sm"
                variant="ghost"
              >
                <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
              </Button>
              <Button
                aria-label={`Удалить группу «${group.name}»`}
                disabled={deleteGroup.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Удалить группу «${group.name}» вместе с ${group.domains.length} доменами?`,
                    )
                  ) {
                    deleteGroup.mutate(group.id, {
                      onSuccess: () => toast.success('Группа удалена'),
                      onError: (error) => toast.error(error.message),
                    })
                  }
                }}
                size="icon-sm"
                variant="ghost"
              >
                <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
              </Button>
            </>
          ) : null}
        </div>
      </header>
      <div className="grid gap-2 p-3">
        {group.domains.map((domain) => {
          const progress = checklistProgress(domain.checklist)
          const meta = DOMAIN_STATUS_META[domain.status]
          const owner = ownerOf(domain.ownerId)
          return (
            <button
              className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary/50"
              data-testid={`domain-row-${domain.id}`}
              key={domain.id}
              onClick={() => onEditDomain(domain)}
              type="button"
            >
              <div className="min-w-[180px] flex-1">
                <Typography as="p" truncate variant="control">
                  {domain.name}
                </Typography>
                <Typography as="p" className="tabular-nums" tone="muted" variant="caption">
                  {progress.done}/{progress.total} пунктов · {percent(progress.done, progress.total)}%
                </Typography>
              </div>
              <ProgressBar className="w-28" done={progress.done} max={progress.total} />
              <StatusChip color={meta.color}>{meta.label}</StatusChip>
              {owner ? (
                <UserAvatar
                  email={owner.email}
                  name={owner.displayName}
                  title={`Ответственный: ${displayNameOf(owner.displayName, owner.email)}`}
                />
              ) : null}
            </button>
          )
        })}
        {group.domains.length === 0 ? (
          <Typography as="p" className="px-1 py-2" tone="muted" variant="bodySm">
            В группе пока нет доменов.
          </Typography>
        ) : null}
      </div>
      {canEdit && renaming ? (
        <RenameGroupDialog
          group={group}
          onDone={() => setRenaming(false)}
          open={renaming}
          rename={renameGroup}
        />
      ) : null}
    </section>
  )
}

function RenameGroupDialog({
  group,
  onDone,
  open,
  rename,
}: {
  group: DomainGroupDto
  onDone: () => void
  open: boolean
  rename: ReturnType<typeof useUpdateDomainGroupMutation>
}) {
  const [name, setName] = useState(group.name)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDone()
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Переименовать группу</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="group-name">Название</FieldLabel>
            <Input
              id="group-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          {error ? (
            <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
              {error}
            </Typography>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={onDone} variant="outline">
            Отмена
          </Button>
          <Button
            disabled={rename.isPending}
            onClick={() =>
              rename.mutate(
                { groupId: group.id, input: { name: name.trim() } },
                {
                  onSuccess: onDone,
                  onError: (mutationError: Error) => setError(mutationError.message),
                },
              )
            }
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Модалка домена: чек-лист с галочками, добавлением, перестановкой и удалением пунктов. */
export function ChecklistDialog({
  domain,
  onOpenChange,
  open,
}: {
  domain: DomainDto
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { projectId } = useSurveyProject()
  const createItem = useCreateChecklistItemMutation(projectId)
  const updateItem = useUpdateChecklistItemMutation(projectId)
  const deleteItem = useDeleteChecklistItemMutation(projectId)
  const deleteDomain = useDeleteDomainMutation(projectId)
  const renameDomain = useUpdateDomainMutation(projectId)
  const [newItemText, setNewItemText] = useState('')
  // Оптимистичный чек-лист: галочка встаёт мгновенно, серверный ответ подтягивает статус домена.
  // Синхронизация — паттерном «корректировка состояния при рендере» (без эффекта): новый массив
  // от react-query заменяет локальную копию, пока пользователь не начал новое переключение.
  const [localItems, setLocalItems] = useState(domain.checklist)
  const [syncedChecklist, setSyncedChecklist] = useState(domain.checklist)
  if (domain.checklist !== syncedChecklist) {
    setSyncedChecklist(domain.checklist)
    setLocalItems(domain.checklist)
  }

  const items = [...localItems].sort((left, right) => left.sortOrder - right.sortOrder)
  const progress = checklistProgress(items)

  const addItem = () => {
    const text = newItemText.trim()
    if (!text) return
    createItem.mutate(
      { domainId: domain.id, input: { text } },
      {
        onSuccess: () => setNewItemText(''),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  const toggleItem = (itemId: string, done: boolean) => {
    setLocalItems((prev) => toggleChecklistDone(prev, itemId))
    updateItem.mutate(
      { itemId, input: { done } },
      {
        onError: (error) => {
          toast.error(error.message)
          setLocalItems(domain.checklist)
        },
      },
    )
  }

  const swapItems = (leftIndex: number, rightIndex: number) => {
    const left = items[leftIndex]
    const right = items[rightIndex]
    if (!left || !right) return
    updateItem.mutate(
      { itemId: left.id, input: { sortOrder: right.sortOrder } },
      { onError: (error) => toast.error(error.message) },
    )
    updateItem.mutate(
      { itemId: right.id, input: { sortOrder: left.sortOrder } },
      { onError: (error) => toast.error(error.message) },
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="checklist-domain-name">{domain.name}</DialogTitle>
          <DialogDescription>
            {progress.done} из {progress.total} пунктов выполнено · статус пересчитывается автоматически
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5" data-testid="checklist-items">
          {items.map((item, index) => (
            <div
              className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
              data-testid={`checklist-item-${item.id}`}
              key={item.id}
            >
              <input
                aria-label={item.text}
                checked={item.done}
                disabled={updateItem.isPending}
                onChange={(event) => toggleItem(item.id, event.target.checked)}
                type="checkbox"
              />
              <Typography
                as="span"
                className={`min-w-0 flex-1 ${item.done ? 'line-through' : ''}`}
                key={`${item.id}-text`}
                tone={item.done ? 'muted' : 'current'}
                variant="bodySm"
              >
                {item.text}
              </Typography>
              <div className="flex shrink-0 items-center">
                <Button
                  aria-label={`Пункт «${item.text}» выше`}
                  disabled={index === 0 || updateItem.isPending}
                  onClick={() => swapItems(index, index - 1)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                </Button>
                <Button
                  aria-label={`Пункт «${item.text}» ниже`}
                  disabled={index === items.length - 1 || updateItem.isPending}
                  onClick={() => swapItems(index, index + 1)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                </Button>
                <Button
                  aria-label={`Удалить пункт «${item.text}»`}
                  disabled={deleteItem.isPending}
                  onClick={() =>
                    deleteItem.mutate(item.id, {
                      onError: (error) => toast.error(error.message),
                    })
                  }
                  size="icon-xs"
                  variant="ghost"
                >
                  <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Чек-лист пуст — добавьте пункты, по которым идёт покрытие домена.
            </Typography>
          ) : null}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            addItem()
          }}
        >
          <Field className="flex-1">
            <FieldLabel htmlFor="checklist-new">Новый пункт</FieldLabel>
            <Input
              data-testid="checklist-new-input"
              id="checklist-new"
              onChange={(event) => setNewItemText(event.target.value)}
              value={newItemText}
            />
          </Field>
          <Button data-testid="checklist-add" disabled={createItem.isPending} type="submit">
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Добавить
          </Button>
        </form>

        <DialogFooter className="items-center sm:justify-between">
          <Button
            disabled={deleteDomain.isPending}
            onClick={() => {
              if (window.confirm(`Удалить домен «${domain.name}»?`)) {
                deleteDomain.mutate(domain.id, {
                  onSuccess: () => {
                    toast.success('Домен удалён')
                    onOpenChange(false)
                  },
                  onError: (error) => toast.error(error.message),
                })
              }
            }}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
            Удалить домен
          </Button>
          <div className="flex gap-2">
            <RenameDomainDialog domain={domain} rename={renameDomain} />
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Закрыть
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Переименование домена: маленький диалог с одним полем. */
function RenameDomainDialog({
  domain,
  rename,
}: {
  domain: DomainDto
  rename: ReturnType<typeof useUpdateDomainMutation>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(domain.name)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
        Переименовать
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Переименовать домен</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rename-domain-name">Название</FieldLabel>
              <Input
                id="rename-domain-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </Field>
            {error ? (
              <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
                {error}
              </Typography>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} variant="outline">
              Отмена
            </Button>
            <Button
              data-testid="domain-rename-submit"
              disabled={rename.isPending || name.trim().length === 0}
              onClick={() =>
                rename.mutate(
                  { domainId: domain.id, input: { name: name.trim() } },
                  {
                    onSuccess: () => {
                      toast.success('Домен переименован')
                      setOpen(false)
                    },
                    onError: (mutationError) => setError(mutationError.message),
                  },
                )
              }
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddDomainDialog({
  groups,
  onDone,
  open,
}: {
  groups: ReadonlyArray<DomainGroupDto>
  onDone: () => void
  open: boolean
}) {
  const { projectId } = useSurveyProject()
  const membersQuery = useMembersQuery(projectId)
  const createDomain = useCreateDomainMutation(projectId)
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [checklist, setChecklist] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    if (name.trim().length === 0) {
      setError('Название домена обязательно.')
      return
    }
    if (!groupId) {
      setError('Выберите группу.')
      return
    }
    createDomain.mutate(
      {
        groupId,
        name: name.trim(),
        ownerId: ownerId && ownerId !== 'none' ? ownerId : null,
        checklist: checklist
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      },
      {
        onSuccess: () => {
          toast.success('Домен добавлен')
          setName('')
          setChecklist('')
          onDone()
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDone()
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый домен</DialogTitle>
          <DialogDescription>Чек-лист задаёт, что нужно покрыть в домене.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="domain-name">Название *</FieldLabel>
            <Input
              data-testid="domain-name"
              id="domain-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Группа *</FieldLabel>
              <Select onValueChange={setGroupId} value={groupId}>
                <SelectTrigger aria-label="Группа домена" data-testid="domain-group-select">
                  <SelectValue placeholder="Выберите группу" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Ответственный</FieldLabel>
              <Select onValueChange={setOwnerId} value={ownerId}>
                <SelectTrigger aria-label="Ответственный за домен">
                  <SelectValue placeholder="Не назначен" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не назначен</SelectItem>
                  {(membersQuery.data?.items ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.userId}>
                      {displayNameOf(member.displayName, member.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="domain-checklist">Чек-лист (по одному пункту в строке)</FieldLabel>
            <Input
              id="domain-checklist"
              onChange={(event) => setChecklist(event.target.value)}
              value={checklist}
            />
          </Field>
          {error ? (
            <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
              {error}
            </Typography>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={onDone} variant="outline">
            Отмена
          </Button>
          <Button data-testid="domain-submit" disabled={createDomain.isPending} onClick={submit}>
            {createDomain.isPending ? 'Создаём…' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
