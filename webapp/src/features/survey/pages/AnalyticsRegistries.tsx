import { ArrowRight01Icon, PencilIcon, PlusIcon, TrashIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  BaselineDto,
  CommunicationDto,
  DecisionDto,
  QuickWinDto,
} from '@ordiks-survey/contracts'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  COMMUNICATION_KIND_META,
  DECISION_STATUS_META,
  formatDateRu,
  QUICK_WIN_STATUS_META,
  toDateInputValue,
} from '../model'
import {
  useBaselinesQuery,
  useCommunicationsQuery,
  useCreateBaselineMutation,
  useCreateCommunicationMutation,
  useCreateDecisionMutation,
  useCreateQuickWinMutation,
  useDecisionsQuery,
  useDeleteBaselineMutation,
  useDeleteCommunicationMutation,
  useDeleteDecisionMutation,
  useDeleteQuickWinMutation,
  useQuickWinsQuery,
  useUpdateBaselineMutation,
  useUpdateCommunicationMutation,
  useUpdateDecisionMutation,
  useUpdateQuickWinMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'
import { domainName, useAnalyticsOptions } from '../analytics-options'

// ============================================================
// Вторая волна аналитических реестров: журнал решений,
// коммуникации, quick wins и базлайны (API уже существовал).
// ============================================================

/** Кнопка удаления с тостами — как DeleteRowButton основной страницы аналитики. */
function DeleteRegistryRowButton({
  ariaLabel,
  mutate,
}: {
  ariaLabel: string
  mutate: (callbacks: {
    onSuccess: () => void
    onError: (error: Error) => void
  }) => void
}) {
  return (
    <Button
      aria-label={ariaLabel}
      onClick={() =>
        mutate({
          onSuccess: () => toast.success('Удалено'),
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

// ------------------------------------------------------------
// Журнал решений
// ------------------------------------------------------------

export function DecisionsTab() {
  const { projectId, canEdit } = useSurveyProject()
  const decisionsQuery = useDecisionsQuery(projectId)
  const [editing, setEditing] = useState<DecisionDto | 'new' | null>(null)

  const items = useMemo(
    () =>
      (decisionsQuery.data?.items ?? [])
        .slice()
        .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt)),
    [decisionsQuery.data],
  )

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div>
          <Button data-testid="decision-create-open" onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Решение
          </Button>
        </div>
      ) : null}

      {decisionsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем журнал решений…
        </Typography>
      ) : items.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первое решение
              </Button>
            ) : undefined
          }
          description="Ключевые решения обследования: что, зачем, кем и когда принято."
          title="Решений нет"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Решение</TableHead>
              <TableHead>Обоснование</TableHead>
              <TableHead>Участники</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Статус</TableHead>
              {canEdit ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((decision) => (
              <TableRow data-decision-title={decision.title} data-testid="decision-row" key={decision.id}>
                <TableCell className="max-w-[280px]">
                  <Typography as="div" variant="control">
                    {decision.title}
                  </Typography>
                </TableCell>
                <TableCell className="max-w-[280px]">
                  {decision.rationale ? (
                    <Typography as="span" tone="muted" truncate variant="caption">
                      {decision.rationale}
                    </Typography>
                  ) : (
                    <Typography as="span" tone="muted">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <Typography as="span" truncate variant="bodySm">
                    {decision.participants || '—'}
                  </Typography>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Typography as="span" variant="bodySm">
                    {formatDateRu(decision.decidedAt, true)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip color={DECISION_STATUS_META[decision.status].color}>
                    {DECISION_STATUS_META[decision.status].label}
                  </StatusChip>
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        aria-label={`Редактировать «${decision.title}»`}
                        onClick={() => setEditing(decision)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                      <DeleteDecisionButton decisionId={decision.id} label={decision.title} projectId={projectId} />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit && editing ? (
        <DecisionDialog
          decision={editing === 'new' ? null : editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
        />
      ) : null}
    </div>
  )
}

function DeleteDecisionButton({
  decisionId,
  label,
  projectId,
}: {
  decisionId: string
  label: string
  projectId: string
}) {
  const del = useDeleteDecisionMutation(projectId)
  return (
    <DeleteRegistryRowButton
      ariaLabel={`Удалить «${label}»`}
      mutate={(callbacks) => del.mutate(decisionId, callbacks)}
    />
  )
}

function DecisionDialog({
  onOpenChange,
  open,
  decision,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  decision: DecisionDto | null
}) {
  const { projectId } = useSurveyProject()
  const createDecision = useCreateDecisionMutation(projectId)
  const updateDecision = useUpdateDecisionMutation(projectId)

  const [title, setTitle] = useState(decision?.title ?? '')
  const [rationale, setRationale] = useState(decision?.rationale ?? '')
  const [participants, setParticipants] = useState(decision?.participants ?? '')
  const [status, setStatus] = useState<DecisionDto['status']>(decision?.status ?? 'active')
  const [decidedAt, setDecidedAt] = useState(toDateInputValue(decision?.decidedAt ?? new Date()))

  const pending = createDecision.isPending || updateDecision.isPending

  const submit = () => {
    if (!title.trim() || !decidedAt) return
    const payload = {
      title: title.trim(),
      rationale: rationale.trim(),
      participants: participants.trim(),
      status,
      decidedAt: new Date(`${decidedAt}T00:00:00`),
    }
    const options = {
      onSuccess: () => {
        toast.success(decision ? 'Решение обновлено' : 'Решение создано')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (decision) updateDecision.mutate({ decisionId: decision.id, input: payload }, options)
    else createDecision.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{decision ? 'Решение' : 'Новое решение'}</DialogTitle>
          <DialogDescription>
            Фиксируйте решения по ходу обследования — они объясняют целевую архитектуру в отчёте.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="decision-title">Решение</FieldLabel>
            <Input
              data-testid="decision-title"
              id="decision-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="decision-rationale">Обоснование</FieldLabel>
            <Textarea
              id="decision-rationale"
              onChange={(event) => setRationale(event.target.value)}
              rows={2}
              value={rationale}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="decision-participants">Участники</FieldLabel>
              <Input
                id="decision-participants"
                onChange={(event) => setParticipants(event.target.value)}
                placeholder="Иванов, Петров"
                value={participants}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="decision-date">Дата</FieldLabel>
              <Input
                id="decision-date"
                onChange={(event) => setDecidedAt(event.target.value)}
                type="date"
                value={decidedAt}
              />
            </Field>
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <Select
                onValueChange={(value) => setStatus(value as DecisionDto['status'])}
                value={status}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DECISION_STATUS_META) as DecisionDto['status'][]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {DECISION_STATUS_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="decision-save" disabled={pending || !title.trim()} onClick={submit}>
            {decision ? 'Сохранить' : 'Создать решение'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// Коммуникации: встречи, звонки, письма
// ------------------------------------------------------------

export function CommunicationsTab() {
  const { projectId, canEdit } = useSurveyProject()
  const communicationsQuery = useCommunicationsQuery(projectId)
  const [editing, setEditing] = useState<CommunicationDto | 'new' | null>(null)

  const items = useMemo(
    () =>
      (communicationsQuery.data?.items ?? [])
        .slice()
        .sort((left, right) => right.heldAt.localeCompare(left.heldAt)),
    [communicationsQuery.data],
  )

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div>
          <Button data-testid="communication-create-open" onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Коммуникация
          </Button>
        </div>
      ) : null}

      {communicationsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем журнал коммуникаций…
        </Typography>
      ) : items.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первая коммуникация
              </Button>
            ) : undefined
          }
          description="Встречи, звонки и письма по обследованию — чтобы не потерять договорённости."
          title="Коммуникаций нет"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Участники</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Итог</TableHead>
              {canEdit ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((communication) => (
              <TableRow
                data-communication-title={communication.title}
                data-testid="communication-row"
                key={communication.id}
              >
                <TableCell className="max-w-[260px]">
                  <Typography as="div" variant="control">
                    {communication.title}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip color={COMMUNICATION_KIND_META[communication.kind].color}>
                    {COMMUNICATION_KIND_META[communication.kind].label}
                  </StatusChip>
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <Typography as="span" truncate variant="bodySm">
                    {communication.participants || '—'}
                  </Typography>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Typography as="span" variant="bodySm">
                    {formatDateRu(communication.heldAt, true)}
                  </Typography>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  {communication.summary ? (
                    <Typography as="span" tone="muted" truncate variant="caption">
                      {communication.summary}
                    </Typography>
                  ) : (
                    <Typography as="span" tone="muted">
                      —
                    </Typography>
                  )}
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        aria-label={`Редактировать «${communication.title}»`}
                        onClick={() => setEditing(communication)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                      <DeleteCommunicationButton
                        communicationId={communication.id}
                        label={communication.title}
                        projectId={projectId}
                      />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit && editing ? (
        <CommunicationDialog
          communication={editing === 'new' ? null : editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
        />
      ) : null}
    </div>
  )
}

function DeleteCommunicationButton({
  communicationId,
  label,
  projectId,
}: {
  communicationId: string
  label: string
  projectId: string
}) {
  const del = useDeleteCommunicationMutation(projectId)
  return (
    <DeleteRegistryRowButton
      ariaLabel={`Удалить «${label}»`}
      mutate={(callbacks) => del.mutate(communicationId, callbacks)}
    />
  )
}

function CommunicationDialog({
  onOpenChange,
  open,
  communication,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  communication: CommunicationDto | null
}) {
  const { projectId } = useSurveyProject()
  const createCommunication = useCreateCommunicationMutation(projectId)
  const updateCommunication = useUpdateCommunicationMutation(projectId)

  const [title, setTitle] = useState(communication?.title ?? '')
  const [kind, setKind] = useState<CommunicationDto['kind']>(communication?.kind ?? 'meeting')
  const [participants, setParticipants] = useState(communication?.participants ?? '')
  const [summary, setSummary] = useState(communication?.summary ?? '')
  const [heldAt, setHeldAt] = useState(toDateInputValue(communication?.heldAt ?? new Date()))

  const pending = createCommunication.isPending || updateCommunication.isPending

  const submit = () => {
    if (!title.trim() || !heldAt) return
    const payload = {
      title: title.trim(),
      kind,
      participants: participants.trim(),
      summary: summary.trim(),
      heldAt: new Date(`${heldAt}T00:00:00`),
    }
    const options = {
      onSuccess: () => {
        toast.success(communication ? 'Коммуникация обновлена' : 'Коммуникация создана')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (communication) {
      updateCommunication.mutate({ communicationId: communication.id, input: payload }, options)
    } else {
      createCommunication.mutate(payload, options)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{communication ? 'Коммуникация' : 'Новая коммуникация'}</DialogTitle>
          <DialogDescription>Встреча, звонок или письмо с итогами договорённостей.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="communication-title">Название</FieldLabel>
              <Input
                data-testid="communication-title"
                id="communication-title"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </Field>
            <Field>
              <FieldLabel>Тип</FieldLabel>
              <Select
                onValueChange={(value) => setKind(value as CommunicationDto['kind'])}
                value={kind}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMMUNICATION_KIND_META) as CommunicationDto['kind'][]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {COMMUNICATION_KIND_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="communication-participants">Участники</FieldLabel>
              <Input
                id="communication-participants"
                onChange={(event) => setParticipants(event.target.value)}
                placeholder="Иванов, Петров"
                value={participants}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="communication-date">Дата</FieldLabel>
              <Input
                id="communication-date"
                onChange={(event) => setHeldAt(event.target.value)}
                type="date"
                value={heldAt}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="communication-summary">Итоги</FieldLabel>
            <Textarea
              id="communication-summary"
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              value={summary}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="communication-save" disabled={pending || !title.trim()} onClick={submit}>
            {communication ? 'Сохранить' : 'Создать'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// Quick Wins: быстрые улучшения
// ------------------------------------------------------------

export function QuickWinsTab() {
  const { projectId, canEdit } = useSurveyProject()
  const quickWinsQuery = useQuickWinsQuery(projectId)
  const [editing, setEditing] = useState<QuickWinDto | 'new' | null>(null)
  const { domains } = useAnalyticsOptions()

  const items = quickWinsQuery.data?.items

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div>
          <Button data-testid="quick-win-create-open" onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Quick Win
          </Button>
        </div>
      ) : null}

      {quickWinsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем быстрые улучшения…
        </Typography>
      ) : (items ?? []).length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первый quick win
              </Button>
            ) : undefined
          }
          description="Дешёвые улучшения с быстрым эффектом — показать заказчику до итогового отчёта."
          title="Quick Wins нет"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Улучшение</TableHead>
              <TableHead>Эффект</TableHead>
              <TableHead>Трудоёмкость</TableHead>
              <TableHead>Домен</TableHead>
              <TableHead>Статус</TableHead>
              {canEdit ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((quickWin) => (
              <TableRow data-quick-win-title={quickWin.title} data-testid="quick-win-row" key={quickWin.id}>
                <TableCell className="max-w-[280px]">
                  <Typography as="div" variant="control">
                    {quickWin.title}
                  </Typography>
                </TableCell>
                <TableCell className="max-w-[280px]">
                  {quickWin.effect ? (
                    <Typography as="span" tone="muted" truncate variant="caption">
                      {quickWin.effect}
                    </Typography>
                  ) : (
                    <Typography as="span" tone="muted">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography as="span" variant="bodySm">
                    {quickWin.effort || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography as="span" variant="bodySm">
                    {domainName(domains, quickWin.domainId)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip color={QUICK_WIN_STATUS_META[quickWin.status].color}>
                    {QUICK_WIN_STATUS_META[quickWin.status].label}
                  </StatusChip>
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        aria-label={`Редактировать «${quickWin.title}»`}
                        onClick={() => setEditing(quickWin)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                      <DeleteQuickWinButton label={quickWin.title} projectId={projectId} quickWinId={quickWin.id} />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit && editing ? (
        <QuickWinDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          quickWin={editing === 'new' ? null : editing}
        />
      ) : null}
    </div>
  )
}

function DeleteQuickWinButton({
  label,
  projectId,
  quickWinId,
}: {
  label: string
  projectId: string
  quickWinId: string
}) {
  const del = useDeleteQuickWinMutation(projectId)
  return (
    <DeleteRegistryRowButton
      ariaLabel={`Удалить «${label}»`}
      mutate={(callbacks) => del.mutate(quickWinId, callbacks)}
    />
  )
}

function QuickWinDialog({
  onOpenChange,
  open,
  quickWin,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  quickWin: QuickWinDto | null
}) {
  const { projectId } = useSurveyProject()
  const createQuickWin = useCreateQuickWinMutation(projectId)
  const updateQuickWin = useUpdateQuickWinMutation(projectId)
  const { domains } = useAnalyticsOptions()

  const [title, setTitle] = useState(quickWin?.title ?? '')
  const [effect, setEffect] = useState(quickWin?.effect ?? '')
  const [effort, setEffort] = useState(quickWin?.effort ?? 'средний')
  const [status, setStatus] = useState<QuickWinDto['status']>(quickWin?.status ?? 'suggested')
  const [domainId, setDomainId] = useState(quickWin?.domainId ?? '')

  const pending = createQuickWin.isPending || updateQuickWin.isPending

  const submit = () => {
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      effect: effect.trim(),
      effort: effort.trim(),
      status,
      domainId: domainId || null,
    }
    const options = {
      onSuccess: () => {
        toast.success(quickWin ? 'Quick Win обновлён' : 'Quick Win создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (quickWin) updateQuickWin.mutate({ quickWinId: quickWin.id, input: payload }, options)
    else createQuickWin.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{quickWin ? 'Quick Win' : 'Новый Quick Win'}</DialogTitle>
          <DialogDescription>Быстрое улучшение: заметный эффект при малой трудоёмкости.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="quick-win-title">Улучшение</FieldLabel>
            <Input
              data-testid="quick-win-title"
              id="quick-win-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="quick-win-effect">Эффект</FieldLabel>
            <Textarea
              id="quick-win-effect"
              onChange={(event) => setEffect(event.target.value)}
              rows={2}
              value={effect}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="quick-win-effort">Трудоёмкость</FieldLabel>
              <Input
                id="quick-win-effort"
                onChange={(event) => setEffort(event.target.value)}
                placeholder="низкий / средний / высокий"
                value={effort}
              />
            </Field>
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <Select onValueChange={(value) => setStatus(value as QuickWinDto['status'])} value={status}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUICK_WIN_STATUS_META) as QuickWinDto['status'][]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {QUICK_WIN_STATUS_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
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
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="quick-win-save" disabled={pending || !title.trim()} onClick={submit}>
            {quickWin ? 'Сохранить' : 'Создать'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// Базлайны: метрики «как есть»
// ------------------------------------------------------------

export function BaselinesTab() {
  const { projectId, canEdit } = useSurveyProject()
  const baselinesQuery = useBaselinesQuery(projectId)
  const [editing, setEditing] = useState<BaselineDto | 'new' | null>(null)
  const { domains } = useAnalyticsOptions()

  const items = baselinesQuery.data?.items

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div>
          <Button data-testid="baseline-create-open" onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Базлайн
          </Button>
        </div>
      ) : null}

      {baselinesQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем базлайны…
        </Typography>
      ) : (items ?? []).length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первая метрика
              </Button>
            ) : undefined
          }
          description="Замеры «как есть» до изменений — с ними эффект проекта измерим."
          title="Базлайнов нет"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Метрика</TableHead>
              <TableHead>Значение</TableHead>
              <TableHead>Ед.</TableHead>
              <TableHead>Домен</TableHead>
              <TableHead>Источник</TableHead>
              {canEdit ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((baseline) => (
              <TableRow data-baseline-metric={baseline.metric} data-testid="baseline-row" key={baseline.id}>
                <TableCell className="max-w-[240px]">
                  <Typography as="div" variant="control">
                    {baseline.metric}
                  </Typography>
                  {baseline.comment ? (
                    <Typography as="p" tone="muted" truncate variant="caption">
                      {baseline.comment}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell className="tabular-nums">
                  <Typography as="span" variant="control">
                    {baseline.value || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography as="span" variant="bodySm">
                    {baseline.unit || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography as="span" variant="bodySm">
                    {domainName(domains, baseline.domainId)}
                  </Typography>
                </TableCell>
                <TableCell className="max-w-[200px]">
                  {baseline.source ? (
                    <Typography as="span" tone="muted" truncate variant="caption">
                      {baseline.source}
                    </Typography>
                  ) : (
                    <Typography as="span" tone="muted">
                      —
                    </Typography>
                  )}
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        aria-label={`Редактировать «${baseline.metric}»`}
                        onClick={() => setEditing(baseline)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                      <DeleteBaselineButton baselineId={baseline.id} label={baseline.metric} projectId={projectId} />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit && editing ? (
        <BaselineDialog
          baseline={editing === 'new' ? null : editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
        />
      ) : null}
    </div>
  )
}

function DeleteBaselineButton({
  baselineId,
  label,
  projectId,
}: {
  baselineId: string
  label: string
  projectId: string
}) {
  const del = useDeleteBaselineMutation(projectId)
  return (
    <DeleteRegistryRowButton
      ariaLabel={`Удалить «${label}»`}
      mutate={(callbacks) => del.mutate(baselineId, callbacks)}
    />
  )
}

function BaselineDialog({
  onOpenChange,
  open,
  baseline,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  baseline: BaselineDto | null
}) {
  const { projectId } = useSurveyProject()
  const createBaseline = useCreateBaselineMutation(projectId)
  const updateBaseline = useUpdateBaselineMutation(projectId)
  const { domains } = useAnalyticsOptions()

  const [metric, setMetric] = useState(baseline?.metric ?? '')
  const [value, setValue] = useState(baseline?.value ?? '')
  const [unit, setUnit] = useState(baseline?.unit ?? '')
  const [comment, setComment] = useState(baseline?.comment ?? '')
  const [source, setSource] = useState(baseline?.source ?? '')
  const [domainId, setDomainId] = useState(baseline?.domainId ?? '')

  const pending = createBaseline.isPending || updateBaseline.isPending

  const submit = () => {
    if (!metric.trim()) return
    const payload = {
      metric: metric.trim(),
      value: value.trim(),
      unit: unit.trim(),
      comment: comment.trim(),
      source: source.trim(),
      domainId: domainId || null,
    }
    const options = {
      onSuccess: () => {
        toast.success(baseline ? 'Базлайн обновлён' : 'Базлайн создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (baseline) updateBaseline.mutate({ baselineId: baseline.id, input: payload }, options)
    else createBaseline.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{baseline ? 'Базлайн' : 'Новый базлайн'}</DialogTitle>
          <DialogDescription>Замер «как есть»: метрика, значение и откуда оно взято.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="baseline-metric">Метрика</FieldLabel>
              <Input
                data-testid="baseline-metric"
                id="baseline-metric"
                onChange={(event) => setMetric(event.target.value)}
                placeholder="Время переналадки"
                value={metric}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="baseline-value">Значение</FieldLabel>
              <Input
                id="baseline-value"
                onChange={(event) => setValue(event.target.value)}
                placeholder="40"
                value={value}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="baseline-unit">Единица</FieldLabel>
              <Input
                id="baseline-unit"
                onChange={(event) => setUnit(event.target.value)}
                placeholder="мин"
                value={unit}
              />
            </Field>
          </div>
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
              <FieldLabel htmlFor="baseline-source">Источник</FieldLabel>
              <Input
                id="baseline-source"
                onChange={(event) => setSource(event.target.value)}
                placeholder="Хронометраж 10.09"
                value={source}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="baseline-comment">Комментарий</FieldLabel>
            <Textarea
              id="baseline-comment"
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              value={comment}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="baseline-save" disabled={pending || !metric.trim()} onClick={submit}>
            {baseline ? 'Сохранить' : 'Создать'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
