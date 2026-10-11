import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  MilestoneIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { StageDto, StageStatus } from '@ordiks-survey/contracts'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ConfirmDeleteDialog, ProgressBar, StatusChip, SurveyEmptyState } from '@/components/survey'
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
import { formatDateRu, STAGE_STATUS_META, toDateInputValue } from '../model'
import {
  useCreateStageMutation,
  useDeleteStageMutation,
  useMoveStageMutation,
  useStagesQuery,
  useTasksQuery,
  useUpdateStageMutation,
} from '../queries'

/** Этапы проекта: карточки с датами, вехой, статусом и прогрессом задач; ↑↓ и CRUD. */
export function StagesPage() {
  const { projectId, canEdit } = useSurveyProject()
  const stagesQuery = useStagesQuery(projectId)
  const tasksQuery = useTasksQuery(projectId)
  const moveStage = useMoveStageMutation(projectId)
  const [editing, setEditing] = useState<StageDto | 'new' | null>(null)

  const stages = useMemo(
    () =>
      (stagesQuery.data?.items ?? [])
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [stagesQuery.data],
  )
  const tasks = tasksQuery.data?.items ?? []

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button data-testid="stage-create-open" onClick={() => setEditing('new')}>
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Добавить этап
            </Button>
          ) : undefined
        }
        description="Дорожная карта обследования: даты, вехи и прогресс задач каждого этапа."
        title="Этапы"
      />

      {stagesQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем этапы…
        </Typography>
      ) : stages.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')}>Добавить первый этап</Button>
            ) : undefined
          }
          description="Этапы задаёт команда ОРДИКС при подготовке проекта."
          title="Этапов пока нет"
        />
      ) : (
        <div className="grid gap-3" data-testid="stages-list">
          {stages.map((stage, index) => {
            const stageTasks = tasks.filter((task) => task.stageId === stage.id)
            const done = stageTasks.filter((task) => task.status === 'done').length
            const meta = STAGE_STATUS_META[stage.status]
            return (
              <div
                className={`grid gap-3 rounded-xl border bg-card p-4 shadow-sm ${
                  stage.status === 'active'
                    ? 'border-l-4 border-l-primary bg-primary/5'
                    : ''
                }`}
                data-testid={`stage-card-${stage.id}`}
                key={stage.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {canEdit ? (
                      <div className="flex flex-col gap-0.5">
                        <Button
                          aria-label={`Переместить «${stage.name}» выше`}
                          disabled={index === 0 || moveStage.isPending}
                          onClick={() =>
                            moveStage.mutate(
                              { stages, index, direction: -1 },
                              {
                                onSuccess: () => toast.success('Этап перемещён'),
                                onError: (error) => toast.error(error.message),
                              },
                            )
                          }
                          size="icon-xs"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                        </Button>
                        <Button
                          aria-label={`Переместить «${stage.name}» ниже`}
                          disabled={index === stages.length - 1 || moveStage.isPending}
                          onClick={() =>
                            moveStage.mutate(
                              { stages, index, direction: 1 },
                              {
                                onSuccess: () => toast.success('Этап перемещён'),
                                onError: (error) => toast.error(error.message),
                              },
                            )
                          }
                          size="icon-xs"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                        </Button>
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <Typography as="h3" truncate variant="control">
                        {stage.name}
                      </Typography>
                      <Typography as="p" tone="muted" variant="caption">
                        {formatDateRu(stage.startAt, true)} — {formatDateRu(stage.endAt, true)}
                        {stageTasks.length
                          ? ` · задач: ${stageTasks.length} (готово ${done})`
                          : ''}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stage.status === 'active' ? <StatusChip color="blue">Сейчас</StatusChip> : null}
                    {stage.milestone ? (
                      <StatusChip color="purple">
                        <HugeiconsIcon icon={MilestoneIcon} size={12} strokeWidth={2} />
                        веха
                      </StatusChip>
                    ) : null}
                    <StatusChip color={meta.color}>{meta.label}</StatusChip>
                    {canEdit ? (
                      <>
                        <Button
                          aria-label={`Редактировать «${stage.name}»`}
                          onClick={() => setEditing(stage)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                        </Button>
                        <DeleteStageButton name={stage.name} stageId={stage.id} />
                      </>
                    ) : null}
                  </div>
                </div>
                <ProgressBar
                  done={done}
                  max={stageTasks.length}
                  tone={stageTasks.length > 0 && done === stageTasks.length ? 'green' : 'primary'}
                />
              </div>
            )
          })}
        </div>
      )}

      {canEdit && editing ? (
        <StageDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open={editing !== null}
          stage={editing === 'new' ? null : editing}
        />
      ) : null}
    </PageContainer>
  )
}

function DeleteStageButton({ name, stageId }: { name: string; stageId: string }) {
  const { projectId } = useSurveyProject()
  const deleteStage = useDeleteStageMutation(projectId)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <Button
        aria-label={`Удалить «${name}»`}
        onClick={() => setConfirming(true)}
        size="icon-sm"
        variant="ghost"
      >
        <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
      </Button>
      <ConfirmDeleteDialog
        description="Задачи этапа останутся в проекте без этапа."
        onConfirm={() =>
          deleteStage.mutate(stageId, {
            onSuccess: () => {
              toast.success('Этап удалён')
              setConfirming(false)
            },
            onError: (error) => toast.error(error.message),
          })
        }
        onOpenChange={setConfirming}
        open={confirming}
        pending={deleteStage.isPending}
        title={`Удалить этап «${name}»?`}
      />
    </>
  )
}

function StageDialog({
  onOpenChange,
  open,
  stage,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  stage: StageDto | null
}) {
  const { projectId } = useSurveyProject()
  const createStage = useCreateStageMutation(projectId)
  const updateStage = useUpdateStageMutation(projectId)
  const [name, setName] = useState(stage?.name ?? '')
  const [start, setStart] = useState(toDateInputValue(stage?.startAt ?? null))
  const [end, setEnd] = useState(toDateInputValue(stage?.endAt ?? null))
  const [status, setStatus] = useState<StageStatus>(stage?.status ?? 'planned')
  const [milestone, setMilestone] = useState(stage?.milestone ?? false)
  const [error, setError] = useState<string | null>(null)

  // «Окончание ≥ начала»: иначе ломаются сортировка и таймлайн (аудит).
  const datesInvalid = start !== '' && end !== '' && end < start

  const submit = () => {
    setError(null)
    if (name.trim().length === 0) {
      setError('Название этапа обязательно.')
      return
    }
    if (datesInvalid) {
      setError('Окончание не может быть раньше начала.')
      return
    }
    const payload = {
      name: name.trim(),
      startAt: start ? new Date(`${start}T00:00:00.000Z`) : null,
      endAt: end ? new Date(`${end}T00:00:00.000Z`) : null,
      status,
      milestone,
    }
    const onDone = () => {
      toast.success(stage ? 'Этап обновлён' : 'Этап добавлен')
      onOpenChange(false)
    }
    const onError = (mutationError: Error) => setError(mutationError.message)
    if (stage) {
      updateStage.mutate(
        { stageId: stage.id, input: payload },
        { onError, onSuccess: onDone },
      )
    } else {
      createStage.mutate(payload, { onError, onSuccess: onDone })
    }
  }

  const pending = createStage.isPending || updateStage.isPending

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{stage ? 'Редактировать этап' : 'Новый этап'}</DialogTitle>
          <DialogDescription>Даты — границы этапа, веха подсвечивается в дашборде.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="stage-name">Название *</FieldLabel>
            <Input
              data-testid="stage-name"
              id="stage-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="stage-start">Начало</FieldLabel>
              <Input
                id="stage-start"
                onChange={(event) => setStart(event.target.value)}
                type="date"
                value={start}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="stage-end">Окончание</FieldLabel>
              <Input
                aria-invalid={datesInvalid || undefined}
                id="stage-end"
                onChange={(event) => setEnd(event.target.value)}
                type="date"
                value={end}
              />
              {datesInvalid ? (
                <Typography as="p" className="text-red-600" variant="caption">
                  Окончание раньше начала
                </Typography>
              ) : null}
            </Field>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <Select onValueChange={(value) => setStatus(value as StageStatus)} value={status}>
                <SelectTrigger data-testid="stage-status" id="stage-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STAGE_STATUS_META).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-2 pb-2">
              <input
                checked={milestone}
                onChange={(event) => setMilestone(event.target.checked)}
                type="checkbox"
              />
              <Typography as="span" variant="label">
                Ключевая веха
              </Typography>
            </label>
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
          <Button data-testid="stage-submit" disabled={pending || datesInvalid} onClick={submit}>
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
