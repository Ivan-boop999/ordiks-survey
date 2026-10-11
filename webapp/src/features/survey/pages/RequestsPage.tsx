import {
  ArrowRight01Icon,
  BubbleChatIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { DataRequestDto } from '@ordiks-survey/contracts'
import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDeleteDialog, StatusChip, SurveyEmptyState, UserAvatar } from '@/components/survey'
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
import { CommentThread } from '../components/CommentThread'
import { formatDateRu, REQUEST_STATUS_META, toDateInputValue } from '../model'
import {
  useCreateDataRequestMutation,
  useDataRequestsQuery,
  useDeleteDataRequestMutation,
  useDomainGroupsQuery,
  useMembersQuery,
  useUpdateDataRequestMutation,
  useUpdateRequestStatusMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

type RequestFilter = 'open' | 'overdue' | 'received' | 'all'

const FILTER_LABELS: Record<RequestFilter, string> = {
  open: 'Открытые',
  overdue: 'Просроченные',
  received: 'Полученные',
  all: 'Все',
}

/** Запросы данных к заказчику: клиентские роли отвечают («в работу»/«получено»), команда — CRUD. */
export function RequestsPage() {
  const { projectId, canEdit, viewRole } = useSurveyProject()
  const requestsQuery = useDataRequestsQuery(projectId)
  const membersQuery = useMembersQuery(projectId)
  const updateStatus = useUpdateRequestStatusMutation(projectId)
  const deleteRequest = useDeleteDataRequestMutation(projectId)
  const [filter, setFilter] = useState<RequestFilter>('open')
  const [editing, setEditing] = useState<DataRequestDto | 'new' | null>(null)
  // Раскрытый тред: обсуждение доступно прямо в строке всем ролям — клиент, ради
  // которого запросы существуют, раньше не мог спросить (тред был только в диалоге команды).
  const [threadFor, setThreadFor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DataRequestDto | null>(null)

  const memberById = useMemo(() => {
    const map = new Map<string, { displayName: string | null; email: string }>()
    for (const member of membersQuery.data?.items ?? []) {
      map.set(member.userId, { displayName: member.displayName, email: member.email })
    }
    return map
  }, [membersQuery.data])

  const items = requestsQuery.data?.items
  const filtered = useMemo(() => {
    const sorted = (items ?? []).slice().sort((left, right) => {
      const deadlineA = left.deadline ?? '9999'
      const deadlineB = right.deadline ?? '9999'
      return deadlineA.localeCompare(deadlineB)
    })
    switch (filter) {
      case 'open':
        return sorted.filter((request) => request.status !== 'received')
      case 'overdue':
        return sorted.filter((request) => request.overdue)
      case 'received':
        return sorted.filter((request) => request.status === 'received')
      default:
        return sorted
    }
  }, [items, filter])

  const overdueCount = filtered === undefined ? 0 : (items ?? []).filter((request) => request.overdue).length
  const canAnswer = canEdit || viewRole === 'client'

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button data-testid="request-create-open" onClick={() => setEditing('new')}>
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Запросить данные
            </Button>
          ) : undefined
        }
        description="Всё, что обследование ждёт от заказчика: выгрузки, регламенты, реестры. Просроченные видны руководству."
        title="Запросы данных"
      />

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(FILTER_LABELS) as RequestFilter[]).map((key) => (
          <Button
            key={key}
            onClick={() => setFilter(key)}
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
          >
            {FILTER_LABELS[key]}
            {key === 'overdue' && overdueCount > 0 ? ` · ${overdueCount}` : ''}
          </Button>
        ))}
      </div>

      {requestsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем запросы…
        </Typography>
      ) : filtered.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первый запрос
              </Button>
            ) : undefined
          }
          description="Здесь фиксируется всё, что обследование ждёт от заказчика: выгрузки, регламенты, реестры."
          title="Запросов нет"
        />
      ) : (
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Что запрошено</TableHead>
                <TableHead>Ответственный</TableHead>
                <TableHead>Дедлайн</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((request) => {
                const meta = REQUEST_STATUS_META[request.status]
                return (
                  <Fragment key={request.id}>
                  <TableRow data-testid="request-row">
                    <TableCell className="max-w-[320px]">
                      <Typography as="div" variant="control">
                        {request.what}
                      </Typography>
                      {request.why ? (
                        <Typography as="p" tone="muted" truncate variant="caption">
                          {request.why}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <RequestAssignee
                        assigneeId={request.assigneeId}
                        memberById={memberById}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {request.deadline ? (
                        <Typography tone={request.overdue ? 'destructive' : 'default'} variant="control">
                          {formatDateRu(request.deadline, true)}
                        </Typography>
                      ) : (
                        <Typography tone="muted">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {request.overdue && request.status !== 'received' ? (
                        <StatusChip color="red">Просрочен</StatusChip>
                      ) : (
                        <StatusChip color={meta.color}>{meta.label}</StatusChip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          aria-label={`Обсуждение «${request.what}»`}
                          aria-pressed={threadFor === request.id}
                          data-testid={`request-thread-toggle-${request.id}`}
                          onClick={() => setThreadFor(threadFor === request.id ? null : request.id)}
                          size="icon-sm"
                          variant={threadFor === request.id ? 'secondary' : 'ghost'}
                        >
                          <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
                        </Button>
                        {canAnswer && request.status !== 'received' ? (
                          <>
                            {request.status === 'requested' ? (
                              <Button
                                aria-label={`Взять «${request.what}» в работу`}
                                onClick={() =>
                                  updateStatus.mutate(
                                    { requestId: request.id, status: 'in_progress' },
                                    {
                                      onSuccess: () => toast.success('Запрос взят в работу'),
                                      onError: (error) => toast.error(error.message),
                                    },
                                  )
                                }
                                size="sm"
                                variant="outline"
                              >
                                В работу
                              </Button>
                            ) : null}
                            <Button
                              aria-label={`Отметить «${request.what}» полученным`}
                              onClick={() =>
                                updateStatus.mutate(
                                  { requestId: request.id, status: 'received' },
                                  {
                                    onSuccess: () => toast.success('Отмечено: данные получены'),
                                    onError: (error) => toast.error(error.message),
                                  },
                                )
                              }
                              size="sm"
                              variant="outline"
                            >
                              Получено
                            </Button>
                          </>
                        ) : null}
                        {canEdit ? (
                          <>
                            <Button
                              aria-label={`Редактировать «${request.what}»`}
                              onClick={() => setEditing(request)}
                              size="icon-sm"
                              variant="ghost"
                            >
                              <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                            </Button>
                            <Button
                              aria-label={`Удалить «${request.what}»`}
                              onClick={() => setDeleting(request)}
                              size="icon-sm"
                              variant="ghost"
                            >
                              <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                  {threadFor === request.id ? (
                    <TableRow data-testid={`request-thread-row-${request.id}`}>
                      <TableCell colSpan={5}>
                        <CommentThread projectId={projectId} threadId={request.id} threadType="request" />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
      )}

      <ConfirmDeleteDialog
        description="Обсуждение запроса будет удалено вместе с ним."
        onConfirm={() => {
          if (!deleting) return
          deleteRequest.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Запрос удалён')
              setDeleting(null)
            },
            onError: (error) => toast.error(error.message),
          })
        }}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        open={deleting !== null}
        pending={deleteRequest.isPending}
        title={deleting ? `Удалить запрос «${deleting.what}»?` : ''}
      />

      {canEdit && editing ? (
        <RequestDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          request={editing === 'new' ? null : editing}
        />
      ) : null}
    </PageContainer>
  )
}

function RequestAssignee({
  assigneeId,
  memberById,
}: {
  assigneeId: string | null
  memberById: Map<string, { displayName: string | null; email: string }>
}) {
  const member = assigneeId ? memberById.get(assigneeId) : undefined
  if (!assigneeId || !member) return <Typography tone="muted">—</Typography>
  return (
    <div className="flex items-center gap-2">
      <UserAvatar name={member.displayName ?? member.email} />
      <Typography truncate variant="control">
        {member.displayName ?? member.email}
      </Typography>
    </div>
  )
}

function RequestDialog({
  open,
  onOpenChange,
  request,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: DataRequestDto | null
}) {
  const { projectId } = useSurveyProject()
  const groupsQuery = useDomainGroupsQuery(projectId)
  const membersQuery = useMembersQuery(projectId)
  const createRequest = useCreateDataRequestMutation(projectId)
  const updateRequest = useUpdateDataRequestMutation(projectId)

  const [what, setWhat] = useState(request?.what ?? '')
  const [why, setWhy] = useState(request?.why ?? '')
  const [domainId, setDomainId] = useState(request?.domainId ?? '')
  const [assigneeId, setAssigneeId] = useState(request?.assigneeId ?? '')
  const [deadline, setDeadline] = useState(request?.deadline ? toDateInputValue(request.deadline) : '')

  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const clientMembers = (membersQuery.data?.items ?? []).filter(
    (member) => member.role === 'client_lead' || member.role === 'client_staff',
  )
  const pending = createRequest.isPending || updateRequest.isPending

  const submit = () => {
    if (!what.trim()) return
    const payload = {
      what: what.trim(),
      why: why.trim(),
      domainId: domainId || null,
      assigneeId: assigneeId || null,
      deadline: deadline ? new Date(`${deadline}T00:00:00`) : null,
    }
    const options = {
      onSuccess: () => {
        toast.success(request ? 'Запрос обновлён' : 'Запрос создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (request) {
      updateRequest.mutate({ requestId: request.id, ...payload }, options)
    } else {
      createRequest.mutate(payload, options)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{request ? 'Запрос данных' : 'Новый запрос данных'}</DialogTitle>
          <DialogDescription>
            Что нужно от заказчика и зачем. Просроченные дедлайны видны на дашборде руководства.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="request-what">Что запрашиваем</FieldLabel>
            <Input
              data-testid="request-what"
              id="request-what"
              onChange={(event) => setWhat(event.target.value)}
              value={what}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="request-why">Зачем</FieldLabel>
            <Textarea id="request-why" onChange={(event) => setWhy(event.target.value)} rows={2} value={why} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Домен</FieldLabel>
              <Select onValueChange={setDomainId} value={domainId || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— не выбран —" />
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
              <FieldLabel>Ответственный (заказчик)</FieldLabel>
              <Select onValueChange={setAssigneeId} value={assigneeId || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— не назначен —" />
                </SelectTrigger>
                <SelectContent>
                  {clientMembers.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.displayName ?? member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="request-deadline">Дедлайн</FieldLabel>
            <Input
              id="request-deadline"
              onChange={(event) => setDeadline(event.target.value)}
              type="date"
              value={deadline}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="request-save" disabled={pending || !what.trim()} onClick={submit}>
            {request ? 'Сохранить' : 'Создать запрос'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
