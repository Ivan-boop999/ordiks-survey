import {
  ArrowRight01Icon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GapDto, RequirementDto, RiskDto } from '@ordiks-survey/contracts'
import { useMemo, useState } from 'react'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { chipColorClass } from '@/components/survey/chip-colors'
import {
  formatDateRu,
  GAP_KIND_META,
  GAP_STATUS_META,
  MOSCOW_META,
  RISK_STATUS_META,
  riskCriticalityColor,
} from '../model'
import { REPORT_PRINT_CSS } from '../report-print'
import { domainName, useAnalyticsOptions } from '../analytics-options'
import {
  BaselinesTab,
  CommunicationsTab,
  DecisionsTab,
  QuickWinsTab,
} from './AnalyticsRegistries'
import {
  useCreateGapMutation,
  useCreateRequirementMutation,
  useCreateRiskMutation,
  useDeleteGapMutation,
  useDeleteRequirementMutation,
  useDeleteRiskMutation,
  useGapsQuery,
  useRequirementsQuery,
  useRisksQuery,
  useUpdateGapMutation,
  useUpdateRequirementMutation,
  useUpdateRiskMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

/** Аналитика обследования: риски (heat), GAP-реестр, требования MoSCoW, решения, коммуникации, quick wins и базлайны. */
export function AnalyticsPage() {
  return (
    <PageContainer>
      <style>{REPORT_PRINT_CSS}</style>
      <PageHeader
        description="Что вынесло обследование: риски, разрывы, требования, решения и метрики «как есть»."
        title="Аналитика"
      />
      <Tabs defaultValue="risks">
        <TabsList className="report-print-hidden">
          <TabsTrigger data-testid="analytics-tab-risks" value="risks">
            Риски
          </TabsTrigger>
          <TabsTrigger data-testid="analytics-tab-gaps" value="gaps">
            GAP
          </TabsTrigger>
          <TabsTrigger data-testid="analytics-tab-requirements" value="requirements">
            Требования
          </TabsTrigger>
          <TabsTrigger data-testid="analytics-tab-decisions" value="decisions">
            Решения
          </TabsTrigger>
          <TabsTrigger data-testid="analytics-tab-communications" value="communications">
            Коммуникации
          </TabsTrigger>
          <TabsTrigger data-testid="analytics-tab-quick-wins" value="quick-wins">
            Quick Wins
          </TabsTrigger>
          <TabsTrigger data-testid="analytics-tab-baselines" value="baselines">
            Базлайны
          </TabsTrigger>
        </TabsList>
        <TabsContent value="risks">
          <RisksTab />
        </TabsContent>
        <TabsContent value="gaps">
          <GapsTab />
        </TabsContent>
        <TabsContent value="requirements">
          <RequirementsTab />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab />
        </TabsContent>
        <TabsContent value="communications">
          <CommunicationsTab />
        </TabsContent>
        <TabsContent value="quick-wins">
          <QuickWinsTab />
        </TabsContent>
        <TabsContent value="baselines">
          <BaselinesTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

// ============================================================
// Риски: вероятность × влияние = критичность
// ============================================================

const PROBABILITY_IMPACT_SCALE = [1, 2, 3, 4, 5] as const

function RisksTab() {
  const { projectId, canEdit, detail } = useSurveyProject()
  const risksQuery = useRisksQuery(projectId)
  const [editing, setEditing] = useState<RiskDto | 'new' | null>(null)
  const { domains } = useAnalyticsOptions()

  const items = risksQuery.data?.items
  const sorted = useMemo(
    () => (items ?? []).slice().sort((left, right) => right.criticality - left.criticality),
    [items],
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 report-print-hidden">
        {canEdit ? (
          <Button data-testid="risk-create-open" onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Риск
          </Button>
        ) : null}
        <Button data-testid="risks-print-button" onClick={() => window.print()} variant="outline">
          <HugeiconsIcon icon={PrinterIcon} strokeWidth={2} />
          Печать
        </Button>
      </div>

      <div className="report-print-root" data-testid="risks-print-root">
        <div className="mb-3 hidden print:block">
          <Typography as="h2" variant="h3">
            Реестр рисков
          </Typography>
          <Typography as="p" tone="muted" variant="caption">
            {detail?.name ?? ''} · {formatDateRu(new Date())}
          </Typography>
        </div>
        {risksQuery.isPending ? (
          <Typography as="p" tone="muted" variant="bodySm">
            Загружаем риски…
          </Typography>
        ) : sorted.length === 0 ? (
          <SurveyEmptyState
            action={
              canEdit ? (
                <Button onClick={() => setEditing('new')} variant="outline">
                  <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                  Первый риск
                </Button>
              ) : undefined
            }
            description="Риск = вероятность × влияние. Критичные попадают в отчёт и дорожную карту."
            title="Рисков нет"
          />
        ) : (
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Риск</TableHead>
              <TableHead>Домен</TableHead>
              <TableHead className="text-center">Вероятность</TableHead>
              <TableHead className="text-center">Влияние</TableHead>
              <TableHead className="text-center">Критичность</TableHead>
              <TableHead>Митигация</TableHead>
              <TableHead>Статус</TableHead>
              {canEdit ? <TableHead className="w-0 report-print-hidden" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((risk) => (
              <TableRow data-risk-title={risk.title} data-testid="risk-row" key={risk.id}>
                <TableCell className="max-w-[280px]">
                  <Typography as="div" variant="control">
                    {risk.title}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography as="span" variant="bodySm">
                    {domainName(domains, risk.domainId)}
                  </Typography>
                </TableCell>
                <TableCell className="text-center tabular-nums">{risk.probability}</TableCell>
                <TableCell className="text-center tabular-nums">{risk.impact}</TableCell>
                <TableCell className="text-center">
                  <span
                    className={`inline-flex min-w-10 justify-center rounded-md px-2 py-1 tabular-nums ${chipColorClass[riskCriticalityColor(risk.criticality)]}`}
                    data-testid="risk-criticality"
                    title={`Вероятность ${risk.probability} × влияние ${risk.impact}`}
                  >
                    <Typography as="span" variant="control">
                      {risk.criticality}
                    </Typography>
                  </span>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  {risk.mitigation ? (
                    <Typography as="span" tone="muted" variant="caption">
                      {risk.mitigation}
                    </Typography>
                  ) : (
                    <Typography as="span" tone="muted">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <StatusChip color={RISK_STATUS_META[risk.status].color}>
                    {RISK_STATUS_META[risk.status].label}
                  </StatusChip>
                </TableCell>
                {canEdit ? (
                  <TableCell className="report-print-hidden">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        aria-label={`Редактировать «${risk.title}»`}
                        onClick={() => setEditing(risk)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                      <DeleteRiskButton label={risk.title} projectId={projectId} riskId={risk.id} />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </div>

      {canEdit && editing ? (
        <RiskDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          risk={editing === 'new' ? null : editing}
        />
      ) : null}
    </div>
  )
}

/** Обёртка удаления с тостами — единый вид для всех трёх реестров. */
function DeleteRowButton({
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

// Хуки нельзя дёргать в цикле/условиях — тонкие обёртки над DeleteRowButton.
function DeleteRiskButton({
  label,
  projectId,
  riskId,
}: {
  label: string
  projectId: string
  riskId: string
}) {
  const del = useDeleteRiskMutation(projectId)
  return (
    <DeleteRowButton
      ariaLabel={`Удалить «${label}»`}
      mutate={(callbacks) => del.mutate(riskId, callbacks)}
    />
  )
}

function RiskDialog({
  onOpenChange,
  open,
  risk,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  risk: RiskDto | null
}) {
  const { projectId } = useSurveyProject()
  const createRisk = useCreateRiskMutation(projectId)
  const updateRisk = useUpdateRiskMutation(projectId)
  const { domains } = useAnalyticsOptions()

  const [title, setTitle] = useState(risk?.title ?? '')
  const [probability, setProbability] = useState(risk?.probability ?? 3)
  const [impact, setImpact] = useState(risk?.impact ?? 3)
  const [status, setStatus] = useState<RiskDto['status']>(risk?.status ?? 'open')
  const [mitigation, setMitigation] = useState(risk?.mitigation ?? '')
  const [domainId, setDomainId] = useState(risk?.domainId ?? '')

  const criticality = probability * impact
  const pending = createRisk.isPending || updateRisk.isPending

  const submit = () => {
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      probability,
      impact,
      status,
      mitigation: mitigation.trim(),
      domainId: domainId || null,
    }
    const options = {
      onSuccess: () => {
        toast.success(risk ? 'Риск обновлён' : 'Риск создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (risk) updateRisk.mutate({ riskId: risk.id, input: payload }, options)
    else createRisk.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{risk ? 'Риск' : 'Новый риск'}</DialogTitle>
          <DialogDescription>
            Критичность = вероятность × влияние; при 15+ считаем риск критическим.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="risk-title">Название</FieldLabel>
            <Input
              data-testid="risk-title"
              id="risk-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Вероятность (1–5)</FieldLabel>
              <Select
                onValueChange={(value) => setProbability(Number(value))}
                value={String(probability)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROBABILITY_IMPACT_SCALE.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Влияние (1–5)</FieldLabel>
              <Select onValueChange={(value) => setImpact(Number(value))} value={String(impact)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROBABILITY_IMPACT_SCALE.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Typography as="span" tone="muted" variant="caption">
              Критичность:
            </Typography>
            <span
              className={`inline-flex min-w-10 justify-center rounded-md px-2 py-1 tabular-nums ${chipColorClass[riskCriticalityColor(criticality)]}`}
            >
              <Typography as="span" variant="control">
                {criticality}
              </Typography>
            </span>
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
              <FieldLabel>Статус</FieldLabel>
              <Select onValueChange={(value) => setStatus(value as RiskDto['status'])} value={status}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RISK_STATUS_META) as RiskDto['status'][]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {RISK_STATUS_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="risk-mitigation">Митигация</FieldLabel>
            <Textarea
              id="risk-mitigation"
              onChange={(event) => setMitigation(event.target.value)}
              rows={2}
              value={mitigation}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="risk-save" disabled={pending || !title.trim()} onClick={submit}>
            {risk ? 'Сохранить' : 'Создать риск'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// GAP: требование / тип / статус / связь с находкой
// ============================================================

function GapsTab() {
  const { projectId, canEdit } = useSurveyProject()
  const gapsQuery = useGapsQuery(projectId)
  const [editing, setEditing] = useState<GapDto | 'new' | null>(null)
  const { domains, findings } = useAnalyticsOptions()

  const items = gapsQuery.data?.items

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div>
          <Button data-testid="gap-create-open" onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            GAP
          </Button>
        </div>
      ) : null}

      {gapsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем GAP-реестр…
        </Typography>
      ) : (items ?? []).length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первый разрыв
              </Button>
            ) : undefined
          }
          description="Разрыв между требованием (стандартом) и тем, как процесс устроен сейчас."
          title="GAP-реестр пуст"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Требование</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Домен</TableHead>
              <TableHead>Находка</TableHead>
              <TableHead>Статус</TableHead>
              {canEdit ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((gap) => (
              <TableRow data-gap-requirement={gap.requirement} data-testid="gap-row" key={gap.id}>
                <TableCell className="max-w-[320px]">
                  <Typography as="div" variant="control">
                    {gap.requirement}
                  </Typography>
                  {gap.comment ? (
                    <Typography as="p" tone="muted" truncate variant="caption">
                      {gap.comment}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusChip color={GAP_KIND_META[gap.kind].color}>
                    {GAP_KIND_META[gap.kind].label}
                  </StatusChip>
                </TableCell>
                <TableCell>
                  <Typography as="span" variant="bodySm">
                    {domainName(domains, gap.domainId)}
                  </Typography>
                </TableCell>
                <TableCell>
                  {gap.findingId ? (
                    <Typography as="span" truncate variant="bodySm">
                      {findings.find((finding) => finding.id === gap.findingId)?.title ?? '—'}
                    </Typography>
                  ) : (
                    <Typography as="span" tone="muted">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <StatusChip color={GAP_STATUS_META[gap.status].color}>
                    {GAP_STATUS_META[gap.status].label}
                  </StatusChip>
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        aria-label={`Редактировать «${gap.requirement}»`}
                        onClick={() => setEditing(gap)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                      <DeleteGapButton gapId={gap.id} label={gap.requirement} projectId={projectId} />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit && editing ? (
        <GapDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          gap={editing === 'new' ? null : editing}
        />
      ) : null}
    </div>
  )
}

function DeleteGapButton({
  gapId,
  label,
  projectId,
}: {
  gapId: string
  label: string
  projectId: string
}) {
  const del = useDeleteGapMutation(projectId)
  return (
    <DeleteRowButton
      ariaLabel={`Удалить «${label}»`}
      mutate={(callbacks) => del.mutate(gapId, callbacks)}
    />
  )
}

function GapDialog({
  onOpenChange,
  open,
  gap,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  gap: GapDto | null
}) {
  const { projectId } = useSurveyProject()
  const createGap = useCreateGapMutation(projectId)
  const updateGap = useUpdateGapMutation(projectId)
  const { domains, findings } = useAnalyticsOptions()

  const [requirement, setRequirement] = useState(gap?.requirement ?? '')
  const [kind, setKind] = useState<GapDto['kind']>(gap?.kind ?? 'std')
  const [status, setStatus] = useState<GapDto['status']>(gap?.status ?? 'open')
  const [comment, setComment] = useState(gap?.comment ?? '')
  const [domainId, setDomainId] = useState(gap?.domainId ?? '')
  const [findingId, setFindingId] = useState(gap?.findingId ?? '')

  const pending = createGap.isPending || updateGap.isPending

  const submit = () => {
    if (!requirement.trim()) return
    const payload = {
      requirement: requirement.trim(),
      kind,
      status,
      comment: comment.trim(),
      domainId: domainId || null,
      findingId: findingId || null,
    }
    const options = {
      onSuccess: () => {
        toast.success(gap ? 'GAP обновлён' : 'GAP создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (gap) updateGap.mutate({ gapId: gap.id, input: payload }, options)
    else createGap.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{gap ? 'GAP' : 'Новый GAP'}</DialogTitle>
          <DialogDescription>
            Что требуется (стандарт, отклонение, ручная операция) и чего не хватает сейчас.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gap-requirement">Требование</FieldLabel>
            <Input
              data-testid="gap-requirement"
              id="gap-requirement"
              onChange={(event) => setRequirement(event.target.value)}
              value={requirement}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Тип</FieldLabel>
              <Select onValueChange={(value) => setKind(value as GapDto['kind'])} value={kind}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GAP_KIND_META) as GapDto['kind'][]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {GAP_KIND_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <Select onValueChange={(value) => setStatus(value as GapDto['status'])} value={status}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GAP_STATUS_META) as GapDto['status'][]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {GAP_STATUS_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <FieldLabel>Связь с находкой</FieldLabel>
              <Select onValueChange={setFindingId} value={findingId || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— без связи —" />
                </SelectTrigger>
                <SelectContent>
                  {findings.map((finding) => (
                    <SelectItem key={finding.id} value={finding.id}>
                      {finding.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="gap-comment">Комментарий</FieldLabel>
            <Textarea
              id="gap-comment"
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
          <Button data-testid="gap-save" disabled={pending || !requirement.trim()} onClick={submit}>
            {gap ? 'Сохранить' : 'Создать GAP'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Требования: MoSCoW-чипы
// ============================================================

function RequirementsTab() {
  const { projectId, canEdit } = useSurveyProject()
  const requirementsQuery = useRequirementsQuery(projectId)
  const [editing, setEditing] = useState<RequirementDto | 'new' | null>(null)
  const { domains, findings } = useAnalyticsOptions()

  const items = requirementsQuery.data?.items

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div>
          <Button data-testid="requirement-create-open" onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Требование
          </Button>
        </div>
      ) : null}

      {requirementsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем требования…
        </Typography>
      ) : (items ?? []).length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первое требование
              </Button>
            ) : undefined
          }
          description="Требования к целевой системе с приоритетами MoSCoW."
          title="Требований нет"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Требование</TableHead>
              <TableHead>MoSCoW</TableHead>
              <TableHead>Домен</TableHead>
              <TableHead>Находка</TableHead>
              <TableHead>Источник</TableHead>
              {canEdit ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((requirement) => (
              <TableRow
                data-requirement-title={requirement.title}
                data-testid="requirement-row"
                key={requirement.id}
              >
                <TableCell className="max-w-[300px]">
                  <Typography as="div" variant="control">
                    {requirement.title}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip color={MOSCOW_META[requirement.moscow].color}>
                    {MOSCOW_META[requirement.moscow].label}
                  </StatusChip>
                </TableCell>
                <TableCell>
                  <Typography as="span" variant="bodySm">
                    {domainName(domains, requirement.domainId)}
                  </Typography>
                </TableCell>
                <TableCell>
                  {requirement.findingId ? (
                    <Typography as="span" truncate variant="bodySm">
                      {findings.find((finding) => finding.id === requirement.findingId)?.title ?? '—'}
                    </Typography>
                  ) : (
                    <Typography as="span" tone="muted">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {requirement.source ? (
                    <Typography as="span" tone="muted" truncate variant="caption">
                      {requirement.source}
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
                        aria-label={`Редактировать «${requirement.title}»`}
                        onClick={() => setEditing(requirement)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                      </Button>
                      <DeleteRequirementButton
                        label={requirement.title}
                        projectId={projectId}
                        requirementId={requirement.id}
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
        <RequirementDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          requirement={editing === 'new' ? null : editing}
        />
      ) : null}
    </div>
  )
}

function DeleteRequirementButton({
  label,
  projectId,
  requirementId,
}: {
  label: string
  projectId: string
  requirementId: string
}) {
  const del = useDeleteRequirementMutation(projectId)
  return (
    <DeleteRowButton
      ariaLabel={`Удалить «${label}»`}
      mutate={(callbacks) => del.mutate(requirementId, callbacks)}
    />
  )
}

function RequirementDialog({
  onOpenChange,
  open,
  requirement,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  requirement: RequirementDto | null
}) {
  const { projectId } = useSurveyProject()
  const createRequirement = useCreateRequirementMutation(projectId)
  const updateRequirement = useUpdateRequirementMutation(projectId)
  const { domains, findings } = useAnalyticsOptions()

  const [title, setTitle] = useState(requirement?.title ?? '')
  const [moscow, setMoscow] = useState<RequirementDto['moscow']>(requirement?.moscow ?? 'must')
  const [source, setSource] = useState(requirement?.source ?? '')
  const [domainId, setDomainId] = useState(requirement?.domainId ?? '')
  const [findingId, setFindingId] = useState(requirement?.findingId ?? '')

  const pending = createRequirement.isPending || updateRequirement.isPending

  const submit = () => {
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      moscow,
      source: source.trim(),
      domainId: domainId || null,
      findingId: findingId || null,
    }
    const options = {
      onSuccess: () => {
        toast.success(requirement ? 'Требование обновлено' : 'Требование создано')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (requirement) updateRequirement.mutate({ requirementId: requirement.id, input: payload }, options)
    else createRequirement.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{requirement ? 'Требование' : 'Новое требование'}</DialogTitle>
          <DialogDescription>
            Приоритет MoSCoW: Must — обязательно, Should — важно, Could — желательно, Won't — вне рамок.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="requirement-title">Формулировка</FieldLabel>
            <Input
              data-testid="requirement-title"
              id="requirement-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Приоритет MoSCoW</FieldLabel>
              <Select
                onValueChange={(value) => setMoscow(value as RequirementDto['moscow'])}
                value={moscow}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MOSCOW_META) as RequirementDto['moscow'][]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {MOSCOW_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="requirement-source">Источник</FieldLabel>
              <Input
                id="requirement-source"
                onChange={(event) => setSource(event.target.value)}
                placeholder="Интервью, регламент…"
                value={source}
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
              <FieldLabel>Связь с находкой</FieldLabel>
              <Select onValueChange={setFindingId} value={findingId || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— без связи —" />
                </SelectTrigger>
                <SelectContent>
                  {findings.map((finding) => (
                    <SelectItem key={finding.id} value={finding.id}>
                      {finding.title}
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
          <Button
            data-testid="requirement-save"
            disabled={pending || !title.trim()}
            onClick={submit}
          >
            {requirement ? 'Сохранить' : 'Создать требование'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
