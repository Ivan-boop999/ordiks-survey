import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReportInsertKind, ReportSectionDto } from '@ordiks-survey/contracts'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageContainer, PageHeader } from '@/components/PageLayout'
import { StatusChip, UserAvatar } from '@/components/survey'
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
import {
  MEMBER_ROLE_LABELS,
  REPORT_APPROVAL_META,
  displayNameOf,
  formatDateRu,
} from '../model'
import { approvalSummary, canApproveSections } from '../report-model'
import { REPORT_PRINT_CSS, ReportTitlePage } from '../report-print'
import {
  useApproveSectionMutation,
  useCreateReportSectionMutation,
  useDeleteReportSectionMutation,
  useDomainGroupsQuery,
  useInsertReportFragmentMutation,
  useMoveReportSectionMutation,
  useRegistriesQuery,
  useReportQuery,
  useUpdateReportSectionMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

/** Отчёт: разделы с автовставками, визы заказчика и печать/PDF на чистых A4. */
export function ReportPage() {
  const { projectId, canEdit, viewRole, detail } = useSurveyProject()
  const reportQuery = useReportQuery(projectId)
  const [editing, setEditing] = useState<ReportSectionDto | 'new' | null>(null)

  const sections = reportQuery.data?.sections ?? []
  const summary = approvalSummary(sections)
  const members = detail?.members ?? []
  const teamMembers = members
    .filter((member) => member.role !== 'observer')
    .map((member) => ({
      name: displayNameOf(member.displayName, member.email),
      roleLabel: MEMBER_ROLE_LABELS[member.role],
    }))

  return (
    <PageContainer>
      <style>{REPORT_PRINT_CSS}</style>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Button data-testid="report-print-button" onClick={() => window.print()} variant="outline">
              <HugeiconsIcon icon={PrinterIcon} strokeWidth={2} />
              Печать/PDF
            </Button>
            {canEdit ? (
              <Button data-testid="section-create-open" onClick={() => setEditing('new')}>
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Раздел
              </Button>
            ) : null}
          </div>
        }
        description={`Сборка отчёта по разделам. Готовность: согласовано ${summary.agreed} из ${summary.sections}${
          summary.withIssues > 0 ? ` · с замечаниями: ${summary.withIssues}` : ''
        }.`}
        title="Отчёт"
      />

      {reportQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем отчёт…
        </Typography>
      ) : sections.length === 0 ? (
        <SurveyEmptyStateBlock canEdit={canEdit} onCreate={() => setEditing('new')} />
      ) : (
        <div className="report-print-root grid gap-4">
          <ReportTitlePage
            client={detail?.client ?? ''}
            dateLabel={formatDateRu(new Date())}
            members={teamMembers}
            projectName={detail?.name ?? 'Проект'}
          />
          {sections.map((section, index) => (
            <SectionCard
              canApprove={canApproveSections(viewRole)}
              canEdit={canEdit}
              index={index}
              key={section.id}
              onEdit={() => setEditing(section)}
              section={section}
              sections={sections}
            />
          ))}
        </div>
      )}

      {canEdit && editing ? (
        <SectionDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          section={editing === 'new' ? null : editing}
        />
      ) : null}
    </PageContainer>
  )
}

function SurveyEmptyStateBlock({
  canEdit,
  onCreate,
}: {
  canEdit: boolean
  onCreate: () => void
}) {
  return (
    <div className="report-print-hidden rounded-xl border border-dashed p-8 text-center">
      <Typography as="h2" variant="h4">
        Разделов нет
      </Typography>
      <Typography as="p" className="mt-1" tone="muted" variant="bodySm">
        Соберите отчёт из разделов: цель, домены, находки, риски и дорожная карта. Автовставки
        дописывают актуальные таблицы одним нажатием.
      </Typography>
      {canEdit ? (
        <Button className="mt-3" onClick={onCreate} variant="outline">
          <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
          Первый раздел
        </Button>
      ) : null}
    </div>
  )
}

// ============================================================
// Раздел: заголовок, тело (HTML), визы, автовставки
// ============================================================

function SectionCard({
  canApprove,
  canEdit,
  index,
  onEdit,
  section,
  sections,
}: {
  canApprove: boolean
  canEdit: boolean
  index: number
  onEdit: () => void
  section: ReportSectionDto
  sections: readonly ReportSectionDto[]
}) {
  const { projectId } = useSurveyProject()
  const move = useMoveReportSectionMutation(projectId)

  // Перестановка соседей: свап sortOrder целыми числами (как у этапов).
  const swap = (direction: -1 | 1) => {
    const neighbor = sections[index + direction]
    if (!neighbor) return
    move.mutate(
      { sectionId: section.id, sortOrder: neighbor.sortOrder },
      { onError: (error: Error) => toast.error(error.message) },
    )
  }

  const decisions = new Set(section.approvals.map((approval) => approval.decision))
  const ownChip =
    decisions.has('changes') ? (
      <StatusChip color="amber">Замечания</StatusChip>
    ) : decisions.has('approved') ? (
      <StatusChip color="green">Согласовано</StatusChip>
    ) : null

  return (
    <section className="report-print-page rounded-xl border p-5" data-section-title={section.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <Typography as="h2" variant="h4">
            {index + 1}. {section.title}
          </Typography>
          {ownChip}
        </div>
        {canEdit ? (
          <div className="report-print-hidden flex items-center gap-1">
            <Button
              aria-label={`Поднять «${section.title}»`}
              disabled={index === 0 || move.isPending}
              onClick={() => swap(-1)}
              size="icon-sm"
              variant="ghost"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
            </Button>
            <Button
              aria-label={`Опустить «${section.title}»`}
              disabled={index === sections.length - 1 || move.isPending}
              onClick={() => swap(1)}
              size="icon-sm"
              variant="ghost"
            >
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
            </Button>
            <Button aria-label={`Редактировать «${section.title}»`} onClick={onEdit} size="icon-sm" variant="ghost">
              <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
            </Button>
          </div>
        ) : null}
      </div>

      {section.body ? (
        <div
          className="report-body mt-3"
          data-testid="section-body"
          // Сервер санитизирует HTML белым списком тегов при каждом сохранении.
          dangerouslySetInnerHTML={{ __html: section.body }}
        />
      ) : (
        <Typography as="p" className="mt-3" tone="muted" variant="bodySm">
          Тело раздела пустое.
        </Typography>
      )}

      <ApprovalsBlock approvals={section.approvals} />

      <div className="report-print-hidden mt-4 flex flex-wrap items-center gap-2">
        {canApprove ? <ApprovalButtons section={section} /> : null}
        {canEdit ? <InsertButtons section={section} /> : null}
        {canEdit ? <DeleteSectionButton section={section} /> : null}
      </div>
    </section>
  )
}

/** Чипы виз с именами; после правок тела сервер сбрасывает визы. */
function ApprovalsBlock({ approvals }: { approvals: ReportSectionDto['approvals'] }) {
  if (approvals.length === 0) return null
  return (
    <div className="mt-4 grid gap-1.5">
      <Typography as="p" tone="muted" variant="caption">
        Визы
      </Typography>
      <div className="flex flex-wrap gap-1.5">
        {approvals.map((approval) => (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
            data-approval-user={approval.displayName ?? approval.email}
            key={approval.userId}
            title={approval.comment || undefined}
          >
            <UserAvatar name={approval.displayName ?? approval.email} />
            <Typography as="span" variant="caption">
              {approval.displayName ?? approval.email}
            </Typography>
            <StatusChip color={REPORT_APPROVAL_META[approval.decision].color}>
              {REPORT_APPROVAL_META[approval.decision].label}
            </StatusChip>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Кнопки виз клиентских ролей: «Согласовано» и «Замечания» (+ комментарий). */
function ApprovalButtons({ section }: { section: ReportSectionDto }) {
  const { projectId } = useSurveyProject()
  const approve = useApproveSectionMutation(projectId)
  const [decision, setDecision] = useState<'approved' | 'changes' | null>(null)
  const [comment, setComment] = useState('')

  const submit = () => {
    if (!decision) return
    approve.mutate(
      {
        sectionId: section.id,
        input: { decision, comment: comment.trim() },
      },
      {
        onSuccess: () => {
          toast.success(decision === 'approved' ? 'Виза поставлена' : 'Замечание отправлено')
          setDecision(null)
          setComment('')
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  return (
    <Dialog onOpenChange={(open) => !open && setDecision(null)} open={decision !== null}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="section-approve-open"
          onClick={() => setDecision('approved')}
          size="sm"
          variant="outline"
        >
          Согласовано
        </Button>
        <Button
          data-testid="section-changes-open"
          onClick={() => setDecision('changes')}
          size="sm"
          variant="outline"
        >
          Замечания
        </Button>
      </div>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === 'approved' ? 'Согласование раздела' : 'Замечания к разделу'}
          </DialogTitle>
          <DialogDescription>
            {decision === 'approved'
              ? 'Виза подтверждает, что раздел согласован без правок.'
              : 'Опишите, что нужно поправить, — команда увидит замечание в визе.'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="approval-comment">Комментарий</FieldLabel>
            <Textarea
              id="approval-comment"
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              value={comment}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => setDecision(null)} variant="ghost">
            Отмена
          </Button>
          <Button
            data-testid="approval-submit"
            disabled={approve.isPending || (decision === 'changes' && !comment.trim())}
            onClick={submit}
          >
            Подтвердить
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Автовставки: сервер собирает HTML-таблицу и дописывает в конец body раздела. */
function InsertButtons({ section }: { section: ReportSectionDto }) {
  const { projectId } = useSurveyProject()
  const insert = useInsertReportFragmentMutation(projectId)
  const groupsQuery = useDomainGroupsQuery(projectId)
  const registriesQuery = useRegistriesQuery(projectId)
  const [findingDomain, setFindingDomain] = useState('')
  const [registryId, setRegistryId] = useState('')

  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const registries = registriesQuery.data?.items ?? []

  const run = (kind: ReportInsertKind) => {
    if (kind === 'findings' && !findingDomain) {
      toast.error('Выберите домен для вставки находок')
      return
    }
    if (kind === 'registry' && !registryId) {
      toast.error('Выберите реестр')
      return
    }
    insert.mutate(
      {
        sectionId: section.id,
        kind,
        ...(kind === 'findings' ? { domainId: findingDomain } : {}),
        ...(kind === 'registry' ? { registryId } : {}),
      },
      {
        onSuccess: () => toast.success('Таблица дописана в раздел'),
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  return (
    <>
      <Button
        data-testid="insert-findings"
        disabled={insert.isPending}
        onClick={() => run('findings')}
        size="sm"
        variant="outline"
      >
        Находки домена
      </Button>
      <Button
        data-testid="insert-requests"
        disabled={insert.isPending}
        onClick={() => run('requests')}
        size="sm"
        variant="outline"
      >
        Открытые запросы
      </Button>
      <Button
        data-testid="insert-coverage"
        disabled={insert.isPending}
        onClick={() => run('coverage')}
        size="sm"
        variant="outline"
      >
        Покрытие доменов
      </Button>
      <Button
        data-testid="insert-risks"
        disabled={insert.isPending}
        onClick={() => run('risks')}
        size="sm"
        variant="outline"
      >
        Реестр рисков
      </Button>
      <Button
        data-testid="insert-registry"
        disabled={insert.isPending}
        onClick={() => run('registry')}
        size="sm"
        variant="outline"
      >
        Реестр
      </Button>
      <Select onValueChange={setFindingDomain} value={findingDomain || undefined}>
        <SelectTrigger aria-label="Домен для вставки находок" className="w-[200px]" size="sm">
          <SelectValue placeholder="Домен (для находок)" />
        </SelectTrigger>
        <SelectContent>
          {domains.map((domain) => (
            <SelectItem key={domain.id} value={domain.id}>
              {domain.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={setRegistryId} value={registryId || undefined}>
        <SelectTrigger aria-label="Реестр для вставки" className="w-[200px]" size="sm">
          <SelectValue placeholder="Реестр (для вставки)" />
        </SelectTrigger>
        <SelectContent>
          {registries.map((registry) => (
            <SelectItem key={registry.id} value={registry.id}>
              {registry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

function DeleteSectionButton({ section }: { section: ReportSectionDto }) {
  const { projectId } = useSurveyProject()
  const del = useDeleteReportSectionMutation(projectId)
  return (
    <Button
      aria-label={`Удалить «${section.title}»`}
      onClick={() =>
        del.mutate(section.id, {
          onSuccess: () => toast.success('Раздел удалён'),
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

// ============================================================
// Диалог раздела: title + body (HTML)
// ============================================================

function SectionDialog({
  onOpenChange,
  open,
  section,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  section: ReportSectionDto | null
}) {
  const { projectId } = useSurveyProject()
  const createSection = useCreateReportSectionMutation(projectId)
  const updateSection = useUpdateReportSectionMutation(projectId)

  const [title, setTitle] = useState(section?.title ?? '')
  const [body, setBody] = useState(section?.body ?? '')
  const pending = createSection.isPending || updateSection.isPending

  const submit = () => {
    if (!title.trim()) return
    const payload = { title: title.trim(), body }
    const options = {
      onSuccess: () => {
        toast.success(section ? 'Раздел обновлён — визы сброшены' : 'Раздел создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (section) updateSection.mutate({ sectionId: section.id, input: payload }, options)
    else createSection.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{section ? 'Раздел отчёта' : 'Новый раздел'}</DialogTitle>
          <DialogDescription>
            Тело — HTML (таблицы, списки); сервер оставляет только безопасные теги. Правки тела
            сбрасывают визы.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="section-title">Заголовок</FieldLabel>
            <Input
              data-testid="section-title"
              id="section-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="section-body">Тело (HTML)</FieldLabel>
            <Textarea
              className="min-h-48 [font-family:var(--font-mono)] [font-size:0.75rem]"
              data-testid="section-body-input"
              id="section-body"
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              value={body}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="section-save" disabled={pending || !title.trim()} onClick={submit}>
            {section ? 'Сохранить' : 'Создать раздел'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
