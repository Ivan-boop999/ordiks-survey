import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { StageDto, TaskDto, TaskStatus } from '@ordiks-survey/contracts'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ConfirmDeleteDialog, StatusChip, UserAvatar } from '@/components/survey'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useSurveyProject } from '../use-survey-project'
import { moveTaskStatus, partitionByStatus } from '../dashboard-model'
import {
  displayNameOf,
  formatDateRu,
  isOverdue,
  TASK_STATUS_META,
  toDateInputValue,
} from '../model'
import {
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useDomainGroupsQuery,
  useMembersQuery,
  useMoveTaskMutation,
  useStagesQuery,
  useTasksQuery,
  useUpdateTaskMutation,
} from '../queries'

type PlanView = 'kanban' | 'list'

/**
 * План задач: канбан из 4 фиксированных колонок (перетаскивание и кнопки), карточка с дедлайном,
 * исполнителем и доменом; фильтры этап/исполнитель; вид-список таблицей.
 */
export function PlanPage() {
  const { projectId, canEdit } = useSurveyProject()
  const tasksQuery = useTasksQuery(projectId)
  const stagesQuery = useStagesQuery(projectId)
  const domainsQuery = useDomainGroupsQuery(projectId)
  const membersQuery = useMembersQuery(projectId)
  const [view, setView] = useState<PlanView>('kanban')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [editing, setEditing] = useState<TaskDto | 'new' | null>(null)

  const stages = useMemo(
    () =>
      (stagesQuery.data?.items ?? [])
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [stagesQuery.data],
  )
  const domains = useMemo(
    () => (domainsQuery.data?.items ?? []).flatMap((group) => group.domains),
    [domainsQuery.data],
  )
  const assigneeNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of membersQuery.data?.items ?? []) {
      map.set(member.userId, displayNameOf(member.displayName, member.email))
    }
    return map
  }, [membersQuery.data])
  // Идентификаторы берём из задач, подписи — из справочника участников: раньше здесь
  // рендерились сырые UUID (аудит: баг фильтра исполнителей).
  const assignees = useMemo(() => {
    const seen = new Set<string>()
    for (const task of tasksQuery.data?.items ?? []) {
      if (task.assigneeId) seen.add(task.assigneeId)
    }
    return [...seen]
  }, [tasksQuery.data])

  const tasks = useMemo(() => {
    const all = tasksQuery.data?.items ?? []
    return all.filter(
      (task) =>
        (stageFilter === 'all' || task.stageId === stageFilter) &&
        (assigneeFilter === 'all' || task.assigneeId === assigneeFilter),
    )
  }, [assigneeFilter, stageFilter, tasksQuery.data])

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button
                aria-pressed={view === 'list'}
                data-testid="plan-view-list"
                onClick={() => setView('list')}
                size="sm"
                variant={view === 'list' ? 'secondary' : 'ghost'}
              >
                Список
              </Button>
              <Button
                aria-pressed={view === 'kanban'}
                data-testid="plan-view-kanban"
                onClick={() => setView('kanban')}
                size="sm"
                variant={view === 'kanban' ? 'secondary' : 'ghost'}
              >
                Канбан
              </Button>
              <Button data-testid="task-create-open" onClick={() => setEditing('new')}>
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Задача
              </Button>
            </div>
          ) : undefined
        }
        description="Задачи обследования по этапам. Четыре статуса: к выполнению, в работе, готово, отменена."
        title="План"
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="plan-filters">
        <Select onValueChange={setStageFilter} value={stageFilter}>
          <SelectTrigger aria-label="Фильтр по этапу" className="h-9 w-[190px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все этапы</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setAssigneeFilter} value={assigneeFilter}>
          <SelectTrigger aria-label="Фильтр по исполнителю" className="h-9 w-[190px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все исполнители</SelectItem>
            {assignees.map((assigneeId) => (
              <SelectItem key={assigneeId} value={assigneeId}>
                {assigneeNameById.get(assigneeId) ?? 'Без имени'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tasksQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем задачи…
        </Typography>
      ) : view === 'kanban' ? (
        <KanbanBoard
          canEdit={canEdit}
          domains={domains}
          onEdit={setEditing}
          stages={stages}
          tasks={tasks}
        />
      ) : (
        <TaskListTable
          canEdit={canEdit}
          domains={domains}
          onEdit={setEditing}
          stages={stages}
          tasks={tasks}
        />
      )}

      {canEdit && editing ? (
        <TaskDialog
          domains={domains}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open={editing !== null}
          stages={stages}
          task={editing === 'new' ? null : editing}
        />
      ) : null}
    </PageContainer>
  )
}

type TaskLookup = {
  domains: ReadonlyArray<{ id: string; name: string }>
  stages: ReadonlyArray<StageDto>
}

function KanbanBoard({
  canEdit,
  domains,
  onEdit,
  stages,
  tasks,
}: TaskLookup & {
  canEdit: boolean
  onEdit: (task: TaskDto) => void
  tasks: ReadonlyArray<TaskDto>
}) {
  const { projectId } = useSurveyProject()
  const moveTask = useMoveTaskMutation(projectId)
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null)

  const domainName = (domainId: string | null) =>
    domains.find((domain) => domain.id === domainId)?.name
  const stageName = (stageId: string | null) =>
    stages.find((stage) => stage.id === stageId)?.name

  const move = (task: TaskDto, status: TaskStatus) => {
    if (task.status === status) return
    moveTask.mutate(
      { taskId: task.id, status },
      { onError: (error) => toast.error(error.message) },
    )
  }

  return (
    <div data-testid="plan-kanban">
      {/* Мобильный: горизонтальный свайп со снапом (HTML5 DnD на таче не работает —
          остаются стрелки на карточках); на md+ — прежняя сетка колонок. */}
      <Typography as="p" className="mb-2 md:hidden" tone="muted" variant="caption">
        Колонки листаются по горизонтали →
      </Typography>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4">
      {partitionByStatus(tasks).map(({ status, tasks: columnTasks }) => {
        const meta = TASK_STATUS_META[status]
        return (
          <div
            className={`flex min-w-[260px] shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/60 p-2.5 md:min-w-0 md:shrink ${
              dragOverColumn === status ? 'outline-2 outline-dashed outline-primary' : ''
            }`}
            data-testid={`kanban-column-${status}`}
            key={status}
            onDragLeave={() => setDragOverColumn(null)}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverColumn(status)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragOverColumn(null)
              const taskId = dragTaskId
              setDragTaskId(null)
              const task = tasks.find((item) => item.id === taskId)
              if (task) move(task, status)
            }}
          >
            <div className="flex items-center gap-2 px-1 pt-0.5 pb-1">
              <StatusChip color={meta.color}>{meta.label}</StatusChip>
              <Typography as="span" className="ml-auto tabular-nums" tone="muted" variant="controlXs">
                {columnTasks.length}
              </Typography>
            </div>
            {columnTasks.map((task) => (
              <article
                className={`rounded-lg border bg-card p-2.5 shadow-sm ${
                  dragTaskId === task.id ? 'opacity-40' : ''
                } ${canEdit ? 'cursor-grab' : ''}`}
                data-testid={`kanban-card-${task.id}`}
                draggable={canEdit}
                key={task.id}
                onDragEnd={() => {
                  setDragTaskId(null)
                  setDragOverColumn(null)
                }}
                onDragStart={() => setDragTaskId(task.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <Typography as="h4" className="min-w-0" variant="bodySmMedium">
                    {task.title}
                  </Typography>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center">
                      <Button
                        aria-label={`Переместить «${task.title}» влево`}
                        disabled={moveTaskStatus(task.status, -1) === null || moveTask.isPending}
                        onClick={() => {
                          const next = moveTaskStatus(task.status, -1)
                          if (next) move(task, next)
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                      </Button>
                      <Button
                        aria-label={`Переместить «${task.title}» вправо`}
                        disabled={moveTaskStatus(task.status, 1) === null || moveTask.isPending}
                        onClick={() => {
                          const next = moveTaskStatus(task.status, 1)
                          if (next) move(task, next)
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                      </Button>
                      <Button
                        aria-label={`Редактировать «${task.title}»`}
                        onClick={() => onEdit(task)}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <TaskCardMeta
                  domainName={domainName(task.domainId)}
                  stageName={stageName(task.stageId)}
                  task={task}
                />
              </article>
            ))}
            {columnTasks.length === 0 ? (
              <Typography as="p" align="center" className="px-1 py-3" tone="muted" variant="caption">
                Пусто
              </Typography>
            ) : null}
          </div>
        )
      })}
      </div>
    </div>
  )
}

function TaskCardMeta({
  domainName,
  stageName,
  task,
}: {
  domainName?: string
  stageName?: string
  task: TaskDto
}) {
  const { detail } = useSurveyProject()
  const assignee = detail?.members.find((member) => member.userId === task.assigneeId)
  const deadlineOverdue = task.status !== 'done' && task.status !== 'cancelled' && isOverdue(task.deadline)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {task.deadline ? (
        <Typography
          as="span"
          className={`tabular-nums ${
            deadlineOverdue ? 'text-red-600 dark:text-red-400' : ''
          }`}
          data-testid={`task-deadline-${task.id}`}
          tone={deadlineOverdue ? 'current' : 'muted'}
          variant={deadlineOverdue ? 'controlXs' : 'caption'}
        >
          до {formatDateRu(task.deadline, true)}
          {deadlineOverdue ? ' · просрочено' : ''}
        </Typography>
      ) : null}
      {domainName ? <StatusChip color="blue">{domainName}</StatusChip> : null}
      {stageName ? <StatusChip outline>{stageName}</StatusChip> : null}
      {assignee ? (
        <UserAvatar
          className="ml-auto"
          email={assignee.email}
          name={assignee.displayName}
          title={displayNameOf(assignee.displayName, assignee.email)}
        />
      ) : null}
    </div>
  )
}

function TaskListTable({
  canEdit,
  domains,
  onEdit,
  stages,
  tasks,
}: TaskLookup & {
  canEdit: boolean
  onEdit: (task: TaskDto) => void
  tasks: ReadonlyArray<TaskDto>
}) {
  const { projectId } = useSurveyProject()
  const deleteTask = useDeleteTaskMutation(projectId)
  const { detail } = useSurveyProject()
  const [deleting, setDeleting] = useState<TaskDto | null>(null)
  const domainName = (domainId: string | null) =>
    domains.find((domain) => domain.id === domainId)?.name
  const stageName = (stageId: string | null) =>
    stages.find((stage) => stage.id === stageId)?.name

  return (
    <div className="overflow-x-auto rounded-xl border" data-testid="plan-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Задача</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Дедлайн</TableHead>
            <TableHead>Этап</TableHead>
            <TableHead>Домен</TableHead>
            <TableHead>Исполнитель</TableHead>
            {canEdit ? <TableHead className="w-20" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 7 : 6}>
                <Typography as="span" tone="muted" variant="bodySm">
                  Задач по фильтру нет.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => {
              const meta = TASK_STATUS_META[task.status]
              const assignee = detail?.members.find((member) => member.userId === task.assigneeId)
              const overdue = task.status !== 'done' && task.status !== 'cancelled' && isOverdue(task.deadline)
              return (
                <TableRow data-testid={`task-row-${task.id}`} key={task.id}>
                  <TableCell className="max-w-[280px]">
                    <Typography as="span" truncate variant="bodySmMedium">
                      {task.title}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip color={meta.color}>{meta.label}</StatusChip>
                  </TableCell>
                  <TableCell
                    className={`tabular-nums ${overdue ? 'text-red-600 dark:text-red-400' : ''}`}
                  >
                    <Typography as="span" variant={overdue ? 'controlXs' : 'caption'}>
                      {task.deadline ? formatDateRu(task.deadline, true) : '—'}
                      {overdue ? ' · просрочено' : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography as="span" tone="muted" variant="caption">
                      {stageName(task.stageId) ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography as="span" tone="muted" variant="caption">
                      {domainName(task.domainId) ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {assignee ? (
                      <span className="flex items-center gap-2">
                        <UserAvatar email={assignee.email} name={assignee.displayName} />
                        <Typography as="span" truncate variant="caption">
                          {displayNameOf(assignee.displayName, assignee.email)}
                        </Typography>
                      </span>
                    ) : (
                      <Typography as="span" variant="caption">—</Typography>
                    )}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          aria-label={`Редактировать «${task.title}»`}
                          onClick={() => onEdit(task)}
                          size="icon-xs"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                        </Button>
                        <Button
                          aria-label={`Удалить «${task.title}»`}
                          onClick={() => setDeleting(task)}
                          size="icon-xs"
                          variant="ghost"
                        >
                          <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
      <ConfirmDeleteDialog
        onConfirm={() => {
          if (!deleting) return
          deleteTask.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Задача удалена')
              setDeleting(null)
            },
            onError: (error) => toast.error(error.message),
          })
        }}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        open={deleting !== null}
        pending={deleteTask.isPending}
        title={deleting ? `Удалить задачу «${deleting.title}»?` : ''}
      />
    </div>
  )
}

function TaskDialog({
  domains,
  onOpenChange,
  open,
  stages,
  task,
}: TaskLookup & {
  onOpenChange: (open: boolean) => void
  open: boolean
  task: TaskDto | null
}) {
  const { projectId } = useSurveyProject()
  const createTask = useCreateTaskMutation(projectId)
  const updateTask = useUpdateTaskMutation(projectId)
  const membersQuery = useMembersQuery(projectId)
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [deadline, setDeadline] = useState(toDateInputValue(task?.deadline ?? null))
  const [stageId, setStageId] = useState<string>(task?.stageId ?? '')
  const [domainId, setDomainId] = useState<string>(task?.domainId ?? '')
  const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    if (title.trim().length === 0) {
      setError('Название задачи обязательно.')
      return
    }
    const payload = {
      title: title.trim(),
      description: description.trim(),
      status,
      deadline: deadline ? new Date(`${deadline}T00:00:00.000Z`) : null,
      // В селектах пустое значение — литерал "none"; в API это null.
      stageId: stageId && stageId !== 'none' ? stageId : null,
      domainId: domainId && domainId !== 'none' ? domainId : null,
      assigneeId: assigneeId && assigneeId !== 'none' ? assigneeId : null,
    }
    const onDone = () => {
      toast.success(task ? 'Задача обновлена' : 'Задача создана')
      onOpenChange(false)
    }
    const onError = (mutationError: Error) => setError(mutationError.message)
    if (task) {
      updateTask.mutate({ taskId: task.id, input: payload }, { onError, onSuccess: onDone })
    } else {
      createTask.mutate(payload, { onError, onSuccess: onDone })
    }
  }

  const pending = createTask.isPending || updateTask.isPending

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Редактировать задачу' : 'Новая задача'}</DialogTitle>
          <DialogDescription>Дедлайн, этап, домен и исполнитель — для фильтров и канбана.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="task-title">Название *</FieldLabel>
            <Input
              data-testid="task-title"
              id="task-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="task-description">Описание</FieldLabel>
            <Textarea
              id="task-description"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="task-deadline">Дедлайн</FieldLabel>
              <Input
                id="task-deadline"
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                value={deadline}
              />
            </Field>
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <Select onValueChange={(value) => setStatus(value as TaskStatus)} value={status}>
                <SelectTrigger data-testid="task-status" id="task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_STATUS_META).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel>Этап</FieldLabel>
            <Select onValueChange={setStageId} value={stageId}>
              <SelectTrigger aria-label="Этап задачи" id="task-stage">
                <SelectValue placeholder="Без этапа" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без этапа</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Домен</FieldLabel>
              <Select onValueChange={setDomainId} value={domainId}>
                <SelectTrigger aria-label="Домен задачи" id="task-domain">
                  <SelectValue placeholder="Без домена" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без домена</SelectItem>
                  {domains.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Исполнитель</FieldLabel>
              <Select onValueChange={setAssigneeId} value={assigneeId}>
                <SelectTrigger aria-label="Исполнитель задачи" id="task-assignee">
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
          <Button data-testid="task-submit" disabled={pending} onClick={submit}>
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
