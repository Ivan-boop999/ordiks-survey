import {
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Calendar03Icon,
  PlusIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import {
  ConfirmDeleteDialog,
  StatusChip,
  SurveyEmptyState,
  SurveyTableSkeleton,
} from '@/components/survey'
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
import { formatDateTimeRu, INTERVIEW_STATUS_META } from '../model'
import { CommentThread } from '../components/CommentThread'
import { useSurveyProject } from '../use-survey-project'
import {
  useCreateInterviewMutation,
  useDeleteInterviewMutation,
  useDomainGroupsQuery,
  useInterviewsQuery,
  useSaveAnswersMutation,
  useUpdateInterviewMutation,
} from '../queries'
import { useAuth } from '@/features/auth'
import { getInterview } from '../api'
import type { GuideQuestionDto, GuideSectionDto, InterviewDto } from '@ordiks-survey/contracts'
import { useGuidesQuery } from '../queries'
import { useFocusTarget } from '../use-focus-target'
import {
  calendarHours,
  isSameDay,
  shiftWeek,
  slotOf,
  slotToDatetimeLocal,
  startOfWeek,
  weekDays,
} from '../interviews-calendar'

type InterviewView = 'table' | 'week'

/** Интервью: расписание, конспект, анкета по гайду с условными вопросами. */
export function InterviewsPage() {
  const { projectId, canEdit } = useSurveyProject()
  const interviewsQuery = useInterviewsQuery(projectId)
  const groupsQuery = useDomainGroupsQuery(projectId)
  const guidesQuery = useGuidesQuery(projectId)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [view, setView] = useState<InterviewView>('table')
  const [creating, setCreating] = useState(false)
  // Предзаполнение «когда» из клика по пустому слоту недельного календаря.
  const [createAt, setCreateAt] = useState('')
  const [viewingId, setViewingId] = useState<string | null>(null)

  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const guideNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const guide of guidesQuery.data?.items ?? []) map.set(guide.id, guide.name)
    return map
  }, [guidesQuery.data])
  const items = interviewsQuery.data?.items
  // Уведомление с ?focus=<id> открывает интервью сразу.
  useFocusTarget(items, (interview) => setViewingId(interview.id))
  const filtered = useMemo(
    () =>
      (items ?? [])
        .slice()
        .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
        .filter((interview) => statusFilter === 'all' || interview.status === statusFilter),
    [items, statusFilter],
  )

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button data-testid="interview-create-open" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Интервью
            </Button>
          ) : undefined
        }
        description="Встречи с сотрудниками заказчика: конспект, анкета по гайду, находки и запросы из ответов."
        title="Интервью"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-pressed={view === 'table'}
          data-testid="interview-view-table"
          onClick={() => setView('table')}
          size="sm"
          variant={view === 'table' ? 'secondary' : 'ghost'}
        >
          Таблица
        </Button>
        <Button
          aria-pressed={view === 'week'}
          data-testid="interview-view-week"
          onClick={() => setView('week')}
          size="sm"
          variant={view === 'week' ? 'secondary' : 'ghost'}
        >
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
          Неделя
        </Button>
        <Select onValueChange={setStatusFilter} value={statusFilter}>
          <SelectTrigger className="w-[200px]" data-testid="interview-status-filter">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(INTERVIEW_STATUS_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {interviewsQuery.isPending ? (
        <SurveyTableSkeleton />
      ) : view === 'week' ? (
        <InterviewWeekCalendar
          canCreate={canEdit}
          interviews={filtered}
          onCreate={(when) => {
            setCreateAt(when)
            setCreating(true)
          }}
          onOpen={(interviewId) => setViewingId(interviewId)}
        />
      ) : filtered.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setCreating(true)} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первое интервью
              </Button>
            ) : undefined
          }
          description="Запланируйте встречу с сотрудником заказчика и заполните анкету по гайду."
          title="Интервью нет"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата и время</TableHead>
              <TableHead>Респондент</TableHead>
              <TableHead>Домен</TableHead>
              <TableHead>Гайд</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((interview) => {
              const meta = INTERVIEW_STATUS_META[interview.status]
              return (
                <TableRow
                  className="cursor-pointer"
                  data-interview-respondent={interview.respondent}
                  key={interview.id}
                  onClick={() => setViewingId(interview.id)}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDateTimeRu(interview.scheduledAt)}
                  </TableCell>
                  <TableCell>
                    <Typography as="div" variant="control">
                      {interview.respondent}
                    </Typography>
                    {interview.respondentRole ? (
                      <Typography as="p" tone="muted" variant="caption">
                        {interview.respondentRole}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {domains.find((d) => d.id === interview.domainId)?.name ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <Typography as="span" className="block truncate" tone="muted" variant="caption">
                      {interview.guideId ? (guideNameById.get(interview.guideId) ?? 'Гайд') : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip color={meta.color}>{meta.label}</StatusChip>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {canEdit && creating ? (
        <InterviewDialog
          initialWhen={createAt}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false)
              setCreateAt('')
            }
          }}
          open
        />
      ) : null}
      {viewingId ? (
        <InterviewViewDialog
          interviewId={viewingId}
          key={viewingId}
          onOpenChange={(open) => {
            if (!open) setViewingId(null)
          }}
          open
        />
      ) : null}
    </PageContainer>
  )
}

/**
 * Недельный календарь интервью: сетка Пн–Вс × 8:00–20:00, интервью — блоками,
 * конфликты (2+ в слоте) — красная рамка, клик по пустому слоту создаёт интервью
 * с предзаполненными датой и временем. Навигация «‹ Неделя ›» и «Сегодня».
 */
function InterviewWeekCalendar({
  canCreate,
  interviews,
  onCreate,
  onOpen,
}: {
  canCreate: boolean
  interviews: ReadonlyArray<InterviewDto>
  onCreate: (when: string) => void
  onOpen: (interviewId: string) => void
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const hours = calendarHours()
  const today = new Date()

  const bySlot = useMemo(() => {
    const map = new Map<string, InterviewDto[]>()
    for (const interview of interviews) {
      const slot = slotOf(interview.scheduledAt, weekStart)
      if (!slot) continue
      const key = `${slot.dayIndex}-${slot.hour}`
      const bucket = map.get(key) ?? []
      bucket.push(interview)
      map.set(key, bucket)
    }
    return map
  }, [interviews, weekStart])

  const weekLabel = `${days[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${days[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`

  return (
    <div className="grid gap-2" data-testid="interview-week-calendar">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label="Предыдущая неделя"
          onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
          size="icon-sm"
          variant="outline"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Button>
        <Typography as="span" className="min-w-32 text-center" variant="control">
          {weekLabel}
        </Typography>
        <Button
          aria-label="Следующая неделя"
          onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
          size="icon-sm"
          variant="outline"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Button>
        <Button onClick={() => setWeekStart(startOfWeek(new Date()))} size="sm" variant="ghost">
          Сегодня
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <div className="min-w-[720px]">
          {/* Шапка дней */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b bg-muted/50">
            <div />
            {days.map((day) => (
              <div
                className={`px-2 py-1.5 text-center ${isSameDay(day, today) ? 'bg-primary/10' : ''}`}
                key={day.toISOString()}
              >
                <Typography as="p" tone={isSameDay(day, today) ? 'primary' : 'muted'} variant="caption">
                  {day.toLocaleDateString('ru-RU', { weekday: 'short' })}
                </Typography>
                <Typography as="p" className="tabular-nums" variant="controlXs">
                  {day.getDate()}
                </Typography>
              </div>
            ))}
          </div>
          {/* Строки часов */}
          {hours.map((hour) => (
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b last:border-b-0" key={hour}>
              <div className="border-r px-1 py-1.5 text-right">
                <Typography as="span" className="tabular-nums" tone="muted" variant="caption">
                  {String(hour).padStart(2, '0')}:00
                </Typography>
              </div>
              {days.map((day, dayIndex) => {
                const bucket = bySlot.get(`${dayIndex}-${hour}`) ?? []
                const conflict = bucket.length > 1
                return (
                  <div className="min-h-11 border-r p-0.5 last:border-r-0" key={day.toISOString()}>
                    {bucket.length > 0 ? (
                      <div className="grid gap-0.5">
                        {bucket.map((interview) => (
                          <button
                            className={`w-full truncate rounded px-1.5 py-1 text-left ${
                              conflict
                                ? 'border border-red-400 bg-red-50 dark:bg-red-950/40'
                                : 'bg-primary/10 hover:bg-primary/20'
                            }`}
                            data-testid={`week-slot-${interview.id}`}
                            key={interview.id}
                            onClick={() => onOpen(interview.id)}
                            title={`${interview.respondent}${
                              interview.respondentRole ? ` — ${interview.respondentRole}` : ''
                            }${conflict ? ' · конфликт' : ''}`}
                            type="button"
                          >
                            <Typography as="span" truncate variant="controlXs">
                              {interview.respondent}
                            </Typography>
                          </button>
                        ))}
                      </div>
                    ) : canCreate ? (
                      <button
                        aria-label={`Создать интервью ${day.getDate()} в ${hour}:00`}
                        className="h-full min-h-10 w-full rounded hover:bg-muted"
                        onClick={() => onCreate(slotToDatetimeLocal(weekStart, { dayIndex, hour }))}
                        type="button"
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <Typography as="p" tone="muted" variant="caption">
        Часы 8:00–20:00; интервью вне сетки недели не показаны. Красная рамка — два и более
        интервью в один слот.
      </Typography>
    </div>
  )
}

function InterviewDialog({
  open,
  onOpenChange,
  initialWhen = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Предзаполненное «когда» (из клика по слоту недельного календаря). */
  initialWhen?: string
}) {
  const { projectId } = useSurveyProject()
  const groupsQuery = useDomainGroupsQuery(projectId)
  const guidesQuery = useGuidesQuery(projectId)
  const createInterview = useCreateInterviewMutation(projectId)
  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const guides = guidesQuery.data?.items ?? []

  const [scheduledAt, setScheduledAt] = useState(initialWhen)
  const [respondent, setRespondent] = useState('')
  const [respondentRole, setRespondentRole] = useState('')
  const [domainId, setDomainId] = useState('')
  const [guideId, setGuideId] = useState('')

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новое интервью</DialogTitle>
          <DialogDescription>Встреча с сотрудником заказчика по домену обследования.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="interview-when">Дата и время</FieldLabel>
              <Input
                id="interview-when"
                onChange={(event) => setScheduledAt(event.target.value)}
                type="datetime-local"
                value={scheduledAt}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="interview-respondent">Респондент</FieldLabel>
              <Input
                data-testid="interview-respondent"
                id="interview-respondent"
                onChange={(event) => setRespondent(event.target.value)}
                value={respondent}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="interview-role">Должность</FieldLabel>
              <Input
                id="interview-role"
                onChange={(event) => setRespondentRole(event.target.value)}
                value={respondentRole}
              />
            </Field>
            <Field>
              <FieldLabel>Домен</FieldLabel>
              <Select onValueChange={setDomainId} value={domainId || undefined}>
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
          </div>
          <Field>
            <FieldLabel>Гайд</FieldLabel>
            <Select onValueChange={setGuideId} value={guideId || undefined}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— без гайда —" />
              </SelectTrigger>
              <SelectContent>
                {guides.map((guide: { id: string; name: string }) => (
                  <SelectItem key={guide.id} value={guide.id}>
                    {guide.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button
            data-testid="interview-save"
            disabled={createInterview.isPending || !respondent.trim() || !scheduledAt}
            onClick={() =>
              createInterview.mutate(
                {
                  scheduledAt: new Date(scheduledAt),
                  respondent: respondent.trim(),
                  respondentRole: respondentRole.trim(),
                  domainId: domainId || null,
                  guideId: guideId || null,
                  notes: '',
                },
                {
                  onSuccess: () => {
                    toast.success('Интервью создано')
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

function InterviewViewDialog({
  open,
  onOpenChange,
  interviewId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  interviewId: string
}) {
  const auth = useAuth()
  const { projectId, canEdit } = useSurveyProject()
  // Детали через react-query: кэш 30 с убирает вспышку «Загружаем…» при повторном
  // открытии (раньше — ручной fetch без кэша на каждый показ диалога).
  const detailQuery = useQuery({
    queryKey: ['interview', projectId, interviewId],
    queryFn: () => getInterview(auth.transport, interviewId),
    enabled: open && projectId.length > 0,
    staleTime: 30_000,
  })
  const detail = detailQuery.data ?? null
  const [answers, setAnswers] = useState<Record<string, string | string[]> | null>(null)
  // Инициализация ответов анкеты при первом получении деталей — паттерном «корректировка
  // состояния при рендере» (как в ChecklistDialog): без эффекта и каскадных перерисовок.
  if (detail && answers === null) {
    const initial: Record<string, string | string[]> = {}
    for (const answer of detail.answers) {
      initial[answer.questionId] = answer.value as string | string[]
    }
    setAnswers(initial)
  }
  // Черновик конспекта: null — не правился, иначе — текущий текст. Dirty-флаг не даёт
  // потерять конспект при случайном закрытии диалога.
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const updateInterview = useUpdateInterviewMutation(projectId)
  const deleteInterview = useDeleteInterviewMutation(projectId)
  const saveAnswers = useSaveAnswersMutation(projectId)
  const guidesQuery = useGuidesQuery(projectId)

  const notesDirty = notesDraft !== null && detail !== null && notesDraft !== detail.notes

  const requestClose = () => {
    if (notesDirty) {
      setConfirmingClose(true)
      return
    }
    onOpenChange(false)
  }

  const saveNotes = (then: () => void) => {
    if (!detail || notesDraft === null) {
      then()
      return
    }
    updateInterview.mutate(
      { interviewId: detail.id, notes: notesDraft },
      {
        onSuccess: () => {
          toast.success('Конспект сохранён')
          setNotesDraft(null)
          then()
        },
        onError: (error: Error) => {
          toast.error(error.message)
          setConfirmingClose(false)
        },
      },
    )
  }

  const guides = guidesQuery.data?.items ?? []
  const guide = detail?.guideId ? guides.find((item: { id: string }) => item.id === detail.guideId) : null

  const isConditionMet = (question: GuideQuestionDto): boolean => {
    if (!question.showIfQuestionId || !question.showIfValue) return true
    const answer = answers?.[question.showIfQuestionId]
    return answer === question.showIfValue
  }

  const setAnswer = (questionId: string, value: string | string[]) => {
    setAnswers((previous) => {
      const next = { ...(previous ?? {}) }
      if (value === '' || (Array.isArray(value) && value.length === 0)) delete next[questionId]
      else next[questionId] = value
      return next
    })
  }

  const submitAnswers = () => {
    if (!detail || !answers) return
    const payload = Object.entries(answers)
      .filter(([, value]) => value !== '' && !(Array.isArray(value) && value.length === 0))
      .map(([questionId, value]) => ({ questionId, value }))
    saveAnswers.mutate(
      { interviewId: detail.id, answers: payload },
      {
        onSuccess: (result) => {
          toast.success(`Сохранено ответов: ${result.saved}`)
          detailQuery.refetch()
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  if (!detail) {
    return (
      <Dialog onOpenChange={(openValue) => (!openValue ? requestClose() : undefined)} open={open}>
        <DialogContent>
          <Typography tone="muted">
            {detailQuery.isPending ? 'Загружаем интервью…' : 'Не удалось загрузить интервью.'}
          </Typography>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog onOpenChange={(openValue) => (!openValue ? requestClose() : undefined)} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detail.respondent}</DialogTitle>
          <DialogDescription>
            {detail.respondentRole} · {formatDateTimeRu(detail.scheduledAt)}
          </DialogDescription>
        </DialogHeader>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {detail.status === 'planned' ? (
              <Button
                onClick={() =>
                  updateInterview.mutate(
                    { interviewId: detail.id, status: 'done' },
                    {
                      onSuccess: () => detailQuery.refetch(),
                      onError: (error: Error) => toast.error(error.message),
                    },
                  )
                }
                size="sm"
                variant="outline"
              >
                Проведено
              </Button>
            ) : null}
            {detail.status === 'done' ? (
              <Button
                onClick={() =>
                  updateInterview.mutate(
                    { interviewId: detail.id, status: 'formatted' },
                    {
                      onSuccess: () => detailQuery.refetch(),
                      onError: (error: Error) => toast.error(error.message),
                    },
                  )
                }
                size="sm"
                variant="outline"
              >
                Оформлено
              </Button>
            ) : null}
            <Button onClick={() => setConfirmingDelete(true)} size="sm" variant="ghost">
              <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
              Удалить
            </Button>
          </div>
        ) : null}

        <ConfirmDeleteDialog
          description={`Конспект и ответы анкеты будут удалены безвозвратно.`}
          onConfirm={() =>
            deleteInterview.mutate(detail.id, {
              onSuccess: () => {
                toast.success('Интервью удалено')
                setNotesDraft(null)
                onOpenChange(false)
              },
              onError: (error: Error) => toast.error(error.message),
            })
          }
          onOpenChange={setConfirmingDelete}
          open={confirmingDelete}
          pending={deleteInterview.isPending}
          title={`Удалить интервью с ${detail.respondent}?`}
        />

        {confirmingClose ? (
          <Dialog onOpenChange={(openValue) => (!openValue ? setConfirmingClose(false) : undefined)} open>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Сохранить конспект перед закрытием?</DialogTitle>
                <DialogDescription>
                  В конспекте есть несохранённые правки — при закрытии без сохранения они пропадут.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setConfirmingClose(false)} variant="ghost">
                  Остаться
                </Button>
                <Button
                  onClick={() => {
                    setNotesDraft(null)
                    setConfirmingClose(false)
                    onOpenChange(false)
                  }}
                  variant="outline"
                >
                  Закрыть без сохранения
                </Button>
                <Button
                  data-testid="interview-notes-save-close"
                  disabled={updateInterview.isPending}
                  onClick={() => saveNotes(() => {
                    setConfirmingClose(false)
                    onOpenChange(false)
                  })}
                >
                  Сохранить и закрыть
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        {canEdit ? (
          <Field>
            <FieldLabel htmlFor="interview-notes">Конспект</FieldLabel>
            <Textarea
              id="interview-notes"
              onChange={(event) => setNotesDraft(event.target.value)}
              rows={4}
              value={notesDraft ?? detail.notes}
            />
            <Button
              className="mt-2"
              disabled={updateInterview.isPending}
              onClick={() => saveNotes(() => undefined)}
              size="sm"
              variant="outline"
            >
              Сохранить конспект
            </Button>
          </Field>
        ) : detail.notes ? (
          <Typography as="p" className="whitespace-pre-wrap" variant="bodySm">
            {detail.notes}
          </Typography>
        ) : null}

        {guide ? (
          <div className="space-y-4">
            <Typography as="h3" variant="h4">
              Анкета: {guide.name}
            </Typography>
            {guide.sections.map((section: GuideSectionDto) => (
              <div className="space-y-3" key={section.id}>
                <Typography as="h4" tone="muted" variant="control">
                  {section.title}
                </Typography>
                {section.questions
                  .slice()
                  .sort((left: GuideQuestionDto, right: GuideQuestionDto) => left.sortOrder - right.sortOrder)
                  .map((question) => {
                    const visible = isConditionMet(question)
                    if (!visible) return null
                    return (
                      <QuestionInput
                        answer={answers?.[question.id]}
                        key={question.id}
                        onAnswer={(value) => setAnswer(question.id, value)}
                        question={question}
                        readOnly={!canEdit}
                      />
                    )
                  })}
              </div>
            ))}
            {canEdit ? (
              <Button data-testid="interview-answers-save" disabled={saveAnswers.isPending} onClick={submitAnswers}>
                Сохранить ответы
              </Button>
            ) : null}
          </div>
        ) : null}

        <CommentThread projectId={detail.projectId} threadId={detail.id} threadType="interview" />
      </DialogContent>
    </Dialog>
  )
}

function QuestionInput({
  question,
  answer,
  onAnswer,
  readOnly,
}: {
  question: GuideQuestionDto
  answer: string | string[] | undefined
  onAnswer: (value: string | string[]) => void
  readOnly: boolean
}) {
  return (
    <Field>
      <FieldLabel>{question.text}</FieldLabel>
      {question.type === 'text' ? (
        <Textarea
          disabled={readOnly}
          onChange={(event) => onAnswer(event.target.value)}
          rows={2}
          value={(answer as string) ?? ''}
        />
      ) : null}
      {question.type === 'yn' ? (
        <Select
          disabled={readOnly}
          onValueChange={(value) => onAnswer(value)}
          value={(answer as string) ?? undefined}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— не отвечено —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Да</SelectItem>
            <SelectItem value="no">Нет</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      {question.type === 'scale' ? (
        <Select
          disabled={readOnly}
          onValueChange={(value) => onAnswer(value)}
          value={(answer as string) ?? undefined}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {question.type === 'choice' ? (
        <Select
          disabled={readOnly}
          onValueChange={(value) => onAnswer(value)}
          value={(answer as string) ?? undefined}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {question.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {question.type === 'multi' ? (
        <div className="space-y-1">
          {question.options.map((option: string) => {
            const checked = Array.isArray(answer) && answer.includes(option)
            return (
              <label className="flex items-center gap-2" key={option}>
                <input
                  checked={checked}
                  onChange={() => {
                    if (readOnly) return
                    const current = Array.isArray(answer) ? answer : []
                    onAnswer(
                      checked ? current.filter((item) => item !== option) : [...current, option],
                    )
                  }}
                  type="checkbox"
                />
                {option}
              </label>
            )
          })}
        </div>
      ) : null}
    </Field>
  )
}
