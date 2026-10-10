import {
  ArrowRight01Icon,
  Link02Icon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { FindingDto } from '@ordiks-survey/contracts'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { StatusChip, SurveyEmptyState, UserAvatar } from '@/components/survey'
import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useSurveyProject } from '../use-survey-project'
import {
  useBulkUpdateFindingsMutation,
  useDeleteFindingMutation,
  useDomainGroupsQuery,
  useFactsQuery,
  useFindingsQuery,
  useMembersQuery,
  useUpdateFindingMutation,
} from '../queries'
import { useCreateFindingMutation } from '../queries'
import { PRIORITY_COLORS } from '../model'

/** Находки: реестр с фильтрами, bulk-сменой статуса и связями на факты-доказательства. */
export function FindingsPage() {
  const { projectId, canEdit, detail } = useSurveyProject()
  const findingsQuery = useFindingsQuery(projectId)
  const bulkUpdate = useBulkUpdateFindingsMutation(projectId)
  const [domainFilter, setDomainFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [editing, setEditing] = useState<FindingDto | 'new' | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const findingStatuses = detail?.settings.findingStatuses ?? []
  const priorities = detail?.settings.findingPriorities ?? []
  const items = findingsQuery.data?.items
  const filtered = useMemo(
    () =>
      (items ?? []).filter(
        (finding) =>
          (!domainFilter || finding.domainId === domainFilter) &&
          (!priorityFilter || finding.priority === priorityFilter),
      ),
    [items, domainFilter, priorityFilter],
  )

  const statusMeta = (status: string) =>
    findingStatuses.find((item) => item.id === status || item.name === status)

  const groupsQuery = useDomainGroupsQuery(projectId)
  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const factsQuery = useFactsQuery(projectId)

  const toggle = (findingId: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(findingId)) next.delete(findingId)
      else next.add(findingId)
      return next
    })
  }

  const bulkStatus = (status: string) => {
    if (selected.size === 0) return
    bulkUpdate.mutate(
      { ids: [...selected], status },
      {
        onSuccess: (result) => {
          toast.success(`Статус обновлён: ${result.updated}`)
          setSelected(new Set())
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button data-testid="finding-create-open" onClick={() => setEditing('new')}>
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Находка
            </Button>
          ) : undefined
        }
        description="Зафиксированные наблюдения с доказательствами и приоритетами. Из них собираются GAP и риски."
        title="Находки"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={setDomainFilter} value={domainFilter || undefined}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Все домены" />
          </SelectTrigger>
          <SelectContent>
            {domains.map((domain) => (
              <SelectItem key={domain.id} value={domain.id}>
                {domain.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setPriorityFilter} value={priorityFilter || undefined}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Любой приоритет" />
          </SelectTrigger>
          <SelectContent>
            {priorities.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {priority}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit && selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2" data-testid="finding-bulk">
            <Typography tone="muted" variant="caption">
              Выбрано: {selected.size}
            </Typography>
            {findingStatuses.map((status) => (
              <Button key={status.id} onClick={() => bulkStatus(status.id)} size="sm" variant="outline">
                → {status.name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {findingsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем находки…
        </Typography>
      ) : filtered.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первая находка
              </Button>
            ) : undefined
          }
          description="Наблюдение с приоритетом и доказательством. Из находок собираются GAP и риски отчёта."
          title="Находок нет"
        />
      ) : (
        <Table data-testid="findings-table">
          <TableHeader>
            <TableRow>
              {canEdit ? (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Выбрать все найденные"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true ? new Set(filtered.map((f) => f.id)) : new Set())
                    }
                  />
                </TableHead>
              ) : null}
              <TableHead>Находка</TableHead>
              <TableHead>Домен</TableHead>
              <TableHead>Приоритет</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Ответственный</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((finding) => {
              const meta = statusMeta(finding.status)
              const domain = domains.find((item) => item.id === finding.domainId)
              const fact = (factsQuery.data?.items ?? []).find((item) => item.id === finding.factId)
              return (
                <TableRow
                  className="cursor-pointer"
                  data-finding-title={finding.title}
                  key={finding.id}
                  onClick={() => setEditing(finding)}
                >
                  {canEdit ? (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Выбрать «${finding.title}»`}
                        checked={selected.has(finding.id)}
                        onCheckedChange={() => toggle(finding.id)}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-[320px]">
                    <div className="flex items-center gap-2">
                      <Typography as="div" truncate variant="control">
                        {finding.title}
                      </Typography>
                      {fact ? (
                        <StatusChip color="purple">
                          <HugeiconsIcon icon={Link02Icon} size={11} strokeWidth={2} />
                          доказательство
                        </StatusChip>
                      ) : null}
                    </div>
                    <Typography as="p" tone="muted" truncate variant="caption">
                      {finding.category}
                    </Typography>
                  </TableCell>
                  <TableCell>{domain?.name ?? '—'}</TableCell>
                  <TableCell>
                    <StatusChip color={PRIORITY_COLORS[finding.priority] ?? 'gray'}>
                      {finding.priority}
                    </StatusChip>
                  </TableCell>
                  <TableCell>
                    <StatusChip color={meta?.color ?? 'gray'}>{meta?.name ?? finding.status}</StatusChip>
                  </TableCell>
                  <TableCell>
                    <FindingOwner projectId={projectId} ownerId={finding.ownerId} />
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {canEdit ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          aria-label={`Редактировать «${finding.title}»`}
                          onClick={() => setEditing(finding)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                        </Button>
                        <DeleteFindingButton finding={finding} onDone={() => setEditing(null)} />
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {editing ? (
        <FindingDialog
          finding={editing === 'new' ? null : editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
        />
      ) : null}
    </PageContainer>
  )
}

function FindingOwner({ projectId, ownerId }: { projectId: string; ownerId: string | null }) {
  const membersQuery = useMembersQuery(projectId)
  const member = (membersQuery.data?.items ?? []).find((item) => item.userId === ownerId)
  if (!ownerId || !member) return <Typography tone="muted">—</Typography>
  return (
    <div className="flex items-center gap-2">
      <UserAvatar name={member.displayName ?? member.email} />
      <Typography truncate variant="control">
        {member.displayName ?? member.email}
      </Typography>
    </div>
  )
}

function DeleteFindingButton({ finding, onDone }: { finding: FindingDto; onDone: () => void }) {
  const { projectId } = useSurveyProject()
  const deleteFinding = useDeleteFindingMutation(projectId)
  return (
    <Button
      aria-label={`Удалить «${finding.title}»`}
      onClick={() =>
        deleteFinding.mutate(finding.id, {
          onSuccess: () => {
            toast.success('Находка удалена')
            onDone()
          },
          onError: (error: Error) => toast.error(error.message),
        })
      }
      size="icon-sm"
      variant="ghost"
    >
      <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
    </Button>
  )
}

function FindingDialog({
  open,
  onOpenChange,
  finding,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  finding: FindingDto | null
}) {
  const { projectId, canEdit, detail } = useSurveyProject()
  const groupsQuery = useDomainGroupsQuery(projectId)
  const membersQuery = useMembersQuery(projectId)
  const factsQuery = useFactsQuery(projectId)
  const createFinding = useCreateFindingMutation(projectId)
  const updateFinding = useUpdateFindingMutation(projectId)

  const statuses = detail?.settings.findingStatuses ?? []
  const categories = detail?.settings.findingCategories ?? []
  const priorities = detail?.settings.findingPriorities ?? []
  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const facts = factsQuery.data?.items ?? []
  const members = membersQuery.data?.items ?? []

  const [title, setTitle] = useState(finding?.title ?? '')
  const [description, setDescription] = useState(finding?.description ?? '')
  const [category, setCategory] = useState(finding?.category ?? categories[0] ?? 'Процесс')
  const [priority, setPriority] = useState(finding?.priority ?? priorities[1] ?? 'Средний')
  const [domainId, setDomainId] = useState(finding?.domainId ?? '')
  const [factId, setFactId] = useState(finding?.factId ?? '')
  const [ownerId, setOwnerId] = useState(finding?.ownerId ?? '')
  const [status, setStatus] = useState(finding?.status ?? statuses[0]?.id ?? 'registered')

  const pending = createFinding.isPending || updateFinding.isPending

  const submit = () => {
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      domainId: domainId || null,
      factId: factId || null,
      ownerId: ownerId || null,
      status,
    }
    const options = {
      onSuccess: () => {
        toast.success(finding ? 'Находка обновлена' : 'Находка создана')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (finding) {
      updateFinding.mutate({ findingId: finding.id, ...payload }, options)
    } else {
      createFinding.mutate(payload, options)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{finding ? 'Находка' : 'Новая находка'}</DialogTitle>
          <DialogDescription>
            Наблюдение с приоритетом и доказательством-фактом.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="finding-title">Название</FieldLabel>
            <Input
              data-testid="finding-title"
              disabled={!canEdit}
              id="finding-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="finding-description">Описание</FieldLabel>
            <Textarea
              disabled={!canEdit}
              id="finding-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Категория</FieldLabel>
              <Select disabled={!canEdit} onValueChange={setCategory} value={category}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Приоритет</FieldLabel>
              <Select disabled={!canEdit} onValueChange={setPriority} value={priority}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <Select disabled={!canEdit} onValueChange={setStatus} value={status}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Домен</FieldLabel>
              <Select disabled={!canEdit} onValueChange={setDomainId} value={domainId || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Доказательство (факт)</FieldLabel>
              <Select disabled={!canEdit} onValueChange={setFactId} value={factId || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {facts.map((fact) => (
                    <SelectItem key={fact.id} value={fact.id}>
                      {fact.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Ответственный</FieldLabel>
              <Select disabled={!canEdit} onValueChange={setOwnerId} value={ownerId || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.displayName ?? member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>
        {canEdit ? (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} variant="ghost">
              Отмена
            </Button>
            <Button data-testid="finding-save" disabled={pending || !title.trim()} onClick={submit}>
              {finding ? 'Сохранить' : 'Создать'}
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
