import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  Upload04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ProcessDto, ProcessStepDto, ProcessSide } from '@ordiks-survey/contracts'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { StatusChip, SurveyEmptyState } from '@/components/survey'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth'
import { PROCESS_SIDE_LABELS } from '../model'
import {
  MAP_TO_NONE,
  MAP_TO_UNSET,
  mapToPatch,
  mapToSelectValue,
  moveStepIds,
  numberedStepLabel,
  stepsOfSide,
} from '../processes-model'
import { processSchemeDownloadUrl } from '../api'
import {
  useCreateProcessMutation,
  useCreateProcessStepMutation,
  useDeleteProcessMutation,
  useDeleteProcessStepMutation,
  useDeleteProcessSchemeMutation,
  useProcessesQuery,
  useReorderProcessStepsMutation,
  useUpdateProcessStepMutation,
  useUploadProcessSchemeMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

const SCHEME_ACCEPT = '.png,.svg,.jpg,.jpeg,.webp'

/** Процессы AS-IS / TO-BE: цепочки шагов, схемы StormBPMN и сравнение сторон. */
export function ProcessesPage() {
  const { projectId, canEdit } = useSurveyProject()
  const processesQuery = useProcessesQuery(projectId)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const processes = processesQuery.data?.items ?? []
  const process = processes.find((item) => item.id === activeId) ?? processes[0] ?? null

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button data-testid="process-create-open" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Процесс
            </Button>
          ) : undefined
        }
        description="Шаги «как есть» и «как будет», схемы из StormBPMN и сравнение сторон с переназначением шагов."
        title="Процессы AS-IS / TO-BE"
      />

      {processes.length > 1 ? (
        <Select
          onValueChange={setActiveId}
          value={process?.id}
        >
          <SelectTrigger aria-label="Активный процесс" className="w-[280px]">
            <SelectValue placeholder="Процесс" />
          </SelectTrigger>
          <SelectContent>
            {processes.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {processesQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем процессы…
        </Typography>
      ) : !process ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setCreating(true)} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первый процесс
              </Button>
            ) : undefined
          }
          description="Опишите процесс «как есть», спроектируйте TO-BE и загрузите схемы из StormBPMN."
          title="Процессов нет"
        />
      ) : (
        <ProcessTabs canEdit={canEdit} process={process} />
      )}

      {canEdit && creating ? (
        <ProcessDialog
          onOpenChange={(open) => {
            if (!open) setCreating(false)
          }}
          open
        />
      ) : null}
    </PageContainer>
  )
}

function ProcessTabs({ canEdit, process }: { canEdit: boolean; process: ProcessDto }) {
  const deleteProcess = useDeleteProcessMutation(process.projectId)
  const [zoom, setZoom] = useState<string | null>(null)

  return (
    <Tabs defaultValue="asis">
      <TabsList>
        <TabsTrigger data-testid="process-tab-asis" value="asis">
          AS-IS
        </TabsTrigger>
        <TabsTrigger data-testid="process-tab-tobe" value="tobe">
          TO-BE
        </TabsTrigger>
        <TabsTrigger data-testid="process-tab-compare" value="compare">
          Сравнение
        </TabsTrigger>
      </TabsList>
      <TabsContent value="asis">
        <SidePanel canEdit={canEdit} process={process} side="asis" onZoom={setZoom} />
      </TabsContent>
      <TabsContent value="tobe">
        <SidePanel canEdit={canEdit} process={process} side="tobe" onZoom={setZoom} />
      </TabsContent>
      <TabsContent value="compare">
        <ComparePanel canEdit={canEdit} process={process} onZoom={setZoom} />
      </TabsContent>
      {canEdit ? (
        <div className="mt-4">
          <Button
            onClick={() =>
              deleteProcess.mutate(process.id, {
                onSuccess: () => toast.success('Процесс удалён'),
                onError: (error: Error) => toast.error(error.message),
              })
            }
            variant="ghost"
          >
            <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
            Удалить процесс
          </Button>
        </div>
      ) : null}
      {zoom ? <ZoomOverlay onClose={() => setZoom(null)} url={zoom} /> : null}
    </Tabs>
  )
}

// ============================================================
// Сторона AS-IS / TO-BE: цепочка шагов + схема
// ============================================================

function SidePanel({
  canEdit,
  process,
  side,
  onZoom,
}: {
  canEdit: boolean
  process: ProcessDto
  side: ProcessSide
  onZoom: (url: string) => void
}) {
  const { projectId } = useSurveyProject()
  const steps = stepsOfSide(process, side)
  const reorder = useReorderProcessStepsMutation(projectId)
  const deleteStep = useDeleteProcessStepMutation(projectId)
  const [editing, setEditing] = useState<ProcessStepDto | 'new' | null>(null)

  const move = (index: number, direction: -1 | 1) => {
    const original = steps.map((step) => step.id)
    const ids = moveStepIds(original, index, direction)
    if (ids === original) return
    reorder.mutate(
      { processId: process.id, side, ids },
      { onError: (error: Error) => toast.error(error.message) },
    )
  }

  return (
    <div className="grid gap-6">
      {steps.length === 0 ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Шагов нет — {side === 'asis' ? 'опишите процесс «как есть».' : 'спроектируйте целевой процесс.'}
        </Typography>
      ) : (
        <ol className="grid gap-2" data-testid={`process-steps-${side}`}>
          {steps.map((step, index) => (
            <li
              className="flex items-start gap-3 rounded-xl border p-3"
              data-step-title={step.title}
              key={step.id}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Typography as="span" tone="primary" variant="control">
                  {index + 1}
                </Typography>
              </span>
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Typography as="span" variant="control">
                    {step.title}
                  </Typography>
                  {step.actorRole ? (
                    <Typography as="span" tone="muted" variant="caption">
                      {step.actorRole}
                    </Typography>
                  ) : null}
                </div>
                {step.effect ? (
                  <Typography as="p" tone="muted" variant="caption">
                    {step.effect}
                  </Typography>
                ) : null}
                {step.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {step.tools.map((tool) => (
                      <StatusChip key={tool} color="blue">
                        {tool}
                      </StatusChip>
                    ))}
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label={`Поднять «${step.title}»`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    aria-label={`Опустить «${step.title}»`}
                    disabled={index === steps.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    aria-label={`Редактировать «${step.title}»`}
                    onClick={() => setEditing(step)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                  </Button>
                  <Button
                    aria-label={`Удалить «${step.title}»`}
                    onClick={() =>
                      deleteStep.mutate(step.id, {
                        onSuccess: () => toast.success('Шаг удалён'),
                        onError: (error: Error) => toast.error(error.message),
                      })
                    }
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {canEdit ? (
        <div>
          <Button data-testid={`step-add-${side}`} onClick={() => setEditing('new')} variant="outline">
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Добавить шаг
          </Button>
        </div>
      ) : null}

      <SchemePanel
        canEdit={canEdit}
        key={`${side}:${process.schemes.find((item) => item.side === side)?.updatedAt ?? 'none'}`}
        onZoom={onZoom}
        process={process}
        side={side}
      />

      {canEdit && editing ? (
        <StepDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          process={process}
          side={side}
          step={editing === 'new' ? null : editing}
        />
      ) : null}
    </div>
  )
}

// ============================================================
// Схема StormBPMN: загрузка (сжатие → подписанный PUT → confirm), превью, замена/удаление
// ============================================================

function SchemePanel({
  canEdit,
  onZoom,
  process,
  side,
}: {
  canEdit: boolean
  onZoom: (url: string) => void
  process: ProcessDto
  side: ProcessSide
}) {
  const { projectId } = useSurveyProject()
  const auth = useAuth()
  const upload = useUploadProcessSchemeMutation(projectId)
  const remove = useDeleteProcessSchemeMutation(projectId)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  const scheme = process.schemes.find((item) => item.side === side) ?? null

  useEffect(() => {
    let alive = true
    if (!scheme) return
    processSchemeDownloadUrl(auth.transport, process.id, side)
      .then((result) => {
        if (alive) setUrl(result.url)
      })
      .catch(() => {
        if (alive) setUrl(null)
      })
    return () => {
      alive = false
    }
  }, [auth.transport, process.id, side, scheme])

  const pick = () => fileInput.current?.click()

  return (
    <div className="rounded-xl border p-4" data-testid={`process-scheme-${side}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography as="span" variant="control">
          Схема StormBPMN · {PROCESS_SIDE_LABELS[side]}
        </Typography>
        {canEdit ? (
          <div className="flex items-center gap-1">
            <input
              accept={SCHEME_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                upload.mutate(
                  { processId: process.id, side, file },
                  {
                    onSuccess: () => toast.success('Схема загружена'),
                    onError: (error: Error) => toast.error(error.message),
                  },
                )
              }}
              ref={fileInput}
              type="file"
            />
            <Button
              data-testid={`scheme-upload-${side}`}
              disabled={upload.isPending}
              onClick={pick}
              size="sm"
              variant={scheme ? 'outline' : 'default'}
            >
              <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />
              {upload.isPending
                ? 'Загружаем…'
                : scheme
                  ? 'Заменить'
                  : 'Загрузить схему (PNG/SVG)'}
            </Button>
            {scheme ? (
              <Button
                aria-label={`Удалить схему ${PROCESS_SIDE_LABELS[side]}`}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { processId: process.id, side },
                    {
                      onSuccess: () => toast.success('Схема удалена'),
                      onError: (error: Error) => toast.error(error.message),
                    },
                  )
                }
                size="icon-sm"
                variant="ghost"
              >
                <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {scheme ? (
        url ? (
          <button
            className="mt-3 block w-full overflow-hidden rounded-lg border"
            data-testid={`scheme-preview-${side}`}
            onClick={() => onZoom(url)}
            type="button"
          >
            <img
              alt={`Схема ${PROCESS_SIDE_LABELS[side]}`}
              className="max-h-[420px] w-full bg-white object-contain"
              src={url}
            />
          </button>
        ) : (
          <Typography as="p" className="mt-3" tone="muted" variant="caption">
            Открываем схему «{scheme.fileName}»…
          </Typography>
        )
      ) : (
        <Typography as="p" className="mt-3" tone="muted" variant="caption">
          Схема не загружена. Экспортируйте диаграмму из StormBPMN (PNG или SVG) и приложите здесь.
        </Typography>
      )}
    </div>
  )
}

// ============================================================
// Сравнение: схемы бок-о-бок + таблица шагов AS-IS → TO-BE
// ============================================================

function ComparePanel({
  canEdit,
  onZoom,
  process,
}: {
  canEdit: boolean
  process: ProcessDto
  onZoom: (url: string) => void
}) {
  const { projectId } = useSurveyProject()
  const updateStep = useUpdateProcessStepMutation(projectId)
  const asis = stepsOfSide(process, 'asis')
  const tobe = stepsOfSide(process, 'tobe')

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2" data-testid="process-compare-schemes">
        <SchemePanel canEdit={false} onZoom={onZoom} process={process} side="asis" />
        <SchemePanel canEdit={false} onZoom={onZoom} process={process} side="tobe" />
      </div>

      <div className="grid gap-2">
        <Typography as="h2" variant="h4">
          Шаги AS-IS → TO-BE
        </Typography>
        {asis.length === 0 ? (
          <Typography as="p" tone="muted" variant="bodySm">
            Шагов AS-IS нет — добавьте их на вкладке AS-IS.
          </Typography>
        ) : (
          <ol className="grid gap-2" data-testid="process-compare-table">
            {asis.map((step, index) => {
              const value = mapToSelectValue(step)
              const mapped = tobe.find((item) => item.id === step.mapToStepId) ?? null
              return (
                <li className="flex flex-wrap items-center gap-3 rounded-xl border p-3" key={step.id}>
                  <div className="grid min-w-[220px] flex-1 gap-1">
                    <Typography as="span" variant="control">
                      {index + 1}. {step.title}
                    </Typography>
                    <Typography as="span" tone="muted" variant="caption">
                      {step.actorRole || '—'}
                    </Typography>
                  </div>
                  <HugeiconsIcon
                    aria-hidden
                    className="shrink-0 text-muted-foreground"
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                  />
                  {step.disappears ? (
                    <StatusChip color="red">исчезает</StatusChip>
                  ) : mapped ? (
                    <div className="grid min-w-[220px] flex-1 gap-1">
                      <Typography as="span" variant="control">
                        {tobe.indexOf(mapped) + 1}. {mapped.title}
                      </Typography>
                      <Typography as="span" tone="muted" variant="caption">
                        {mapped.actorRole || '—'}
                      </Typography>
                    </div>
                  ) : (
                    <Typography as="span" className="flex-1" tone="muted" variant="caption">
                      не определено
                    </Typography>
                  )}
                  {canEdit ? (
                    <Select
                      onValueChange={(next) =>
                        updateStep.mutate(
                          { stepId: step.id, input: mapToPatch(next) },
                          { onError: (error: Error) => toast.error(error.message) },
                        )
                      }
                      value={value || MAP_TO_UNSET}
                    >
                      <SelectTrigger
                        aria-label={`Переход шага «${step.title}»`}
                        className="w-[220px]"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MAP_TO_UNSET}>— не определено —</SelectItem>
                        <SelectItem value={MAP_TO_NONE}>исчезает</SelectItem>
                        {tobe.map((item, position) => (
                          <SelectItem key={item.id} value={item.id}>
                            {numberedStepLabel(item, position + 1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Диалоги
// ============================================================

function ProcessDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { projectId } = useSurveyProject()
  const createProcess = useCreateProcessMutation(projectId)
  const [name, setName] = useState('')

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый процесс</DialogTitle>
          <DialogDescription>Например «Продажа от заявки до отгрузки».</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="process-name">Название</FieldLabel>
            <Input
              data-testid="process-name"
              id="process-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button
            data-testid="process-save"
            disabled={createProcess.isPending || !name.trim()}
            onClick={() =>
              createProcess.mutate(
                { name: name.trim() },
                {
                  onSuccess: () => {
                    toast.success('Процесс создан')
                    onOpenChange(false)
                  },
                  onError: (error: Error) => toast.error(error.message),
                },
              )
            }
          >
            Создать
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepDialog({
  onOpenChange,
  open,
  process,
  side,
  step,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  process: ProcessDto
  side: ProcessSide
  step: ProcessStepDto | null
}) {
  const { projectId } = useSurveyProject()
  const createStep = useCreateProcessStepMutation(projectId)
  const updateStep = useUpdateProcessStepMutation(projectId)
  const tobe = stepsOfSide(process, 'tobe')

  const [title, setTitle] = useState(step?.title ?? '')
  const [actorRole, setActorRole] = useState(step?.actorRole ?? '')
  const [tools, setTools] = useState(step?.tools.join(', ') ?? '')
  const [effect, setEffect] = useState(step?.effect ?? '')
  const [mapTo, setMapTo] = useState(step ? mapToSelectValue(step) : MAP_TO_UNSET)

  const pending = createStep.isPending || updateStep.isPending
  const parsedTools = tools
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const submit = () => {
    if (!title.trim()) return
    const patch = mapToPatch(mapTo)
    // Связь AS-IS → TO-BE задаётся только для шагов asis: шаги TO-BE «сами по себе».
    const payload = {
      title: title.trim(),
      actorRole: actorRole.trim(),
      tools: parsedTools,
      effect: effect.trim() || null,
      disappears: side === 'asis' ? patch.disappears : false,
      mapToStepId: side === 'asis' ? patch.mapToStepId : null,
    }
    const options = {
      onSuccess: () => {
        toast.success(step ? 'Шаг обновлён' : 'Шаг добавлен')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (step) {
      updateStep.mutate({ stepId: step.id, input: payload }, options)
    } else {
      createStep.mutate({ processId: process.id, input: { ...payload, side } }, options)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step ? 'Шаг процесса' : `Новый шаг · ${PROCESS_SIDE_LABELS[side]}`}
          </DialogTitle>
          <DialogDescription>
            Что делает роль на этом шаге и какими инструментами пользуется.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="step-title">Заголовок</FieldLabel>
            <Input
              data-testid="step-title"
              id="step-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="step-role">Роль</FieldLabel>
            <Input
              id="step-role"
              onChange={(event) => setActorRole(event.target.value)}
              placeholder="Менеджер ОСР"
              value={actorRole}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="step-tools">Инструменты (через запятую)</FieldLabel>
            <Input
              id="step-tools"
              onChange={(event) => setTools(event.target.value)}
              placeholder="Excel, 1С, бумага"
              value={tools}
            />
            {parsedTools.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {parsedTools.map((tool) => (
                  <StatusChip color="blue" key={tool}>
                    {tool}
                  </StatusChip>
                ))}
              </div>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="step-effect">Эффект / комментарий</FieldLabel>
            <Textarea
              id="step-effect"
              onChange={(event) => setEffect(event.target.value)}
              rows={2}
              value={effect}
            />
          </Field>
          {side === 'asis' ? (
            <Field>
              <FieldLabel>Переход в TO-BE</FieldLabel>
              <Select onValueChange={setMapTo} value={mapTo || MAP_TO_UNSET}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MAP_TO_UNSET}>— не определено —</SelectItem>
                  <SelectItem value={MAP_TO_NONE}>исчезает</SelectItem>
                  {tobe.map((item, position) => (
                    <SelectItem key={item.id} value={item.id}>
                      {numberedStepLabel(item, position + 1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="step-save" disabled={pending || !title.trim()} onClick={submit}>
            {step ? 'Сохранить' : 'Добавить шаг'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ZoomOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="presentation"
    >
      <img alt="" className="max-h-full max-w-full rounded-lg bg-white" src={url} />
    </div>
  )
}
