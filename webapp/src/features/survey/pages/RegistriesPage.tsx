import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  TrashIcon,
  Upload04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  ChipColor,
  FormulaOperand,
  RegistryDto,
  RegistryEntryDto,
  RegistryFieldDto,
  RegistryStatusDto,
} from '@ordiks-survey/contracts'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ColorDot, ConfirmDeleteDialog, StatusChip, SurveyEmptyState } from '@/components/survey'
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
import {
  formatDateRu,
  REGISTRY_FIELD_TYPE_META,
} from '../model'
import { REPORT_PRINT_CSS } from '../report-print'
import {
  entryFieldValue,
  entryInputFromValues,
  entryValuesFromInput,
  formulaLabel,
  importableFields,
  mappingForApi,
  previewImport,
  sortedFields,
  sortedStatuses,
  suggestFieldKey,
  suggestMapping,
} from '../registries-model'
import {
  useBulkDeleteRegistryEntriesMutation,
  useBulkStatusRegistryEntriesMutation,
  useCreateRegistryEntryMutation,
  useCreateRegistryFieldMutation,
  useCreateRegistryMutation,
  useCreateRegistryStatusMutation,
  useDeleteRegistryEntryMutation,
  useDeleteRegistryFieldMutation,
  useDeleteRegistryMutation,
  useDeleteRegistryStatusMutation,
  useImportRegistryEntriesMutation,
  useRegistriesQuery,
  useRegistryEntriesQuery,
  useUpdateRegistryEntryMutation,
  useUpdateRegistryFieldMutation,
  useUpdateRegistryMutation,
  useUpdateRegistryStatusMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

const CHIP_COLORS: readonly ChipColor[] = ['gray', 'blue', 'green', 'red', 'amber', 'purple']
const CHIP_COLOR_LABELS: Record<ChipColor, string> = {
  gray: 'Серый',
  blue: 'Синий',
  green: 'Зелёный',
  red: 'Красный',
  amber: 'Янтарный',
  purple: 'Фиолетовый',
}

/** Свои реестры: конструктор полей/статусов, записи с вычисляемыми формулами, импорт и печать. */
export function RegistriesPage() {
  const { projectId, canEdit } = useSurveyProject()
  const registriesQuery = useRegistriesQuery(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<RegistryDto | 'new' | null>(null)

  const items = registriesQuery.data?.items ?? []
  const selected = items.find((registry) => registry.id === selectedId) ?? null

  return (
    <PageContainer>
      <style>{REPORT_PRINT_CSS}</style>
      {selected ? (
        <RegistryDetail
          onBack={() => setSelectedId(null)}
          registry={selected}
        />
      ) : (
        <>
          <PageHeader
            actions={
              canEdit ? (
                <Button data-testid="registry-create-open" onClick={() => setEditing('new')}>
                  <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                  Реестр
                </Button>
              ) : undefined
            }
            description="Учётные листы проекта с настраиваемыми полями, статусами и формулами. Печатаются и вставляются в отчёт."
            title="Свои реестры"
          />
          {registriesQuery.isPending ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Загружаем реестры…
            </Typography>
          ) : items.length === 0 ? (
            <SurveyEmptyState
              action={
                canEdit ? (
                  <Button onClick={() => setEditing('new')} variant="outline">
                    <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                    Первый реестр
                  </Button>
                ) : undefined
              }
              description="Оснастка, материалы, поручения — любой учётный лист с формулами и импортом из Excel."
              title="Реестров пока нет"
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="registries-list">
              {items.map((registry) => (
                <div
                  className="group cursor-pointer rounded-xl border p-4 transition hover:border-primary/50 hover:shadow-sm"
                  data-registry-name={registry.name}
                  key={registry.id}
                  onClick={() => setSelectedId(registry.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Typography as="div" truncate variant="control">
                      {registry.name}
                    </Typography>
                    {canEdit ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          aria-label={`Редактировать «${registry.name}»`}
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditing(registry)
                          }}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                        </Button>
                        <DeleteRegistryButton registry={registry} />
                      </div>
                    ) : null}
                  </div>
                  {registry.description ? (
                    <Typography as="p" className="mt-1" tone="muted" truncate variant="caption">
                      {registry.description}
                    </Typography>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusChip color="gray">полей: {registry.fields.length}</StatusChip>
                    <StatusChip color="gray">статусов: {registry.statuses.length}</StatusChip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {canEdit && editing ? (
        <RegistryDialog
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
          registry={editing === 'new' ? null : editing}
        />
      ) : null}
    </PageContainer>
  )
}

function DeleteRegistryButton({ registry }: { registry: RegistryDto }) {
  const { projectId } = useSurveyProject()
  const del = useDeleteRegistryMutation(projectId)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <Button
        aria-label={`Удалить «${registry.name}»`}
        onClick={(event) => {
          event.stopPropagation()
          setConfirming(true)
        }}
        size="icon-sm"
        variant="ghost"
      >
        <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
    </Button>
      <ConfirmDeleteDialog
        description="Будут удалены все записи реестра и его настройка (поля, статусы)."
        onConfirm={() =>
          del.mutate(registry.id, {
            onSuccess: () => {
              toast.success('Реестр удалён')
              setConfirming(false)
            },
            onError: (error: Error) => toast.error(error.message),
          })
        }
        onOpenChange={setConfirming}
        open={confirming}
        pending={del.isPending}
        title={`Удалить реестр «${registry.name}»?`}
      />
    </>
  )
}

/** Создание/переименование реестра: название + описание. */
function RegistryDialog({
  onOpenChange,
  open,
  registry,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  registry: RegistryDto | null
}) {
  const { projectId } = useSurveyProject()
  const createRegistry = useCreateRegistryMutation(projectId)
  const updateRegistry = useUpdateRegistryMutation(projectId)
  const [name, setName] = useState(registry?.name ?? '')
  const [description, setDescription] = useState(registry?.description ?? '')
  const pending = createRegistry.isPending || updateRegistry.isPending

  const submit = () => {
    if (!name.trim()) return
    const options = {
      onSuccess: () => {
        toast.success(registry ? 'Реестр обновлён' : 'Реестр создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (registry) {
      updateRegistry.mutate(
        { registryId: registry.id, input: { name: name.trim(), description: description.trim() } },
        options,
      )
    } else {
      createRegistry.mutate({ name: name.trim(), description: description.trim() }, options)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{registry ? 'Реестр' : 'Новый реестр'}</DialogTitle>
          <DialogDescription>
            Поля и статусы настраиваются после создания — кнопками «Поле» и «Статус».
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="registry-name">Название</FieldLabel>
            <Input
              data-testid="registry-name"
              id="registry-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Оснастка, Материалы…"
              value={name}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="registry-description">Описание</FieldLabel>
            <Textarea
              id="registry-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button data-testid="registry-save" disabled={pending || !name.trim()} onClick={submit}>
            {registry ? 'Сохранить' : 'Создать реестр'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Реестр: конструктор (поля/статусы) + записи + импорт + печать
// ============================================================

function RegistryDetail({ onBack, registry }: { onBack: () => void; registry: RegistryDto }) {
  const { canEdit, detail } = useSurveyProject()
  const [statusFilter, setStatusFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())
  const [editingEntry, setEditingEntry] = useState<RegistryEntryDto | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  // Поиск с лёгким дебаунсом — не дёргаем API на каждый символ.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  const entriesQuery = useRegistryEntriesQuery(registry.id, {
    statusId: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
    q: search || undefined,
  })
  const fields = sortedFields(registry.fields)
  const statuses = sortedStatuses(registry.statuses)
  const entries = entriesQuery.data?.items ?? []
  const statusById = new Map(statuses.map((status) => [status.id, status]))

  const bulkStatus = useBulkStatusRegistryEntriesMutation(registry.id)
  const bulkDelete = useBulkDeleteRegistryEntriesMutation(registry.id)

  const toggleEntry = (entryId: string) => {
    setSelectedEntries((previous) => {
      const next = new Set(previous)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  const changeBulkStatus = (statusId: string) => {
    if (selectedEntries.size === 0) return
    bulkStatus.mutate(
      { ids: [...selectedEntries], statusId },
      {
        onSuccess: (result) => {
          toast.success(`Статус обновлён: ${result.updated}`)
          setSelectedEntries(new Set())
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  const removeBulk = () => {
    if (selectedEntries.size === 0) return
    bulkDelete.mutate([...selectedEntries], {
      onSuccess: (result) => {
        toast.success(`Удалено записей: ${result.deleted}`)
        setSelectedEntries(new Set())
      },
      onError: (error: Error) => toast.error(error.message),
    })
  }

  return (
    <div className="grid gap-4">
      <div className="report-print-hidden">
        <Button onClick={onBack} size="sm" variant="ghost">
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Все реестры
        </Button>
      </div>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Button data-testid="registry-print-button" onClick={() => window.print()} variant="outline">
              <HugeiconsIcon icon={PrinterIcon} strokeWidth={2} />
              Печать
            </Button>
            {canEdit ? (
              <Button
                data-testid="registry-import-open"
                onClick={() => setImporting(true)}
                variant="outline"
              >
                <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />
                Импорт из текста
              </Button>
            ) : null}
          </div>
        }
        description={registry.description || 'Записи реестра с вычисляемыми формулами.'}
        title={registry.name}
      />

      {canEdit ? <Constructor registry={registry} /> : null}

      <div className="flex flex-wrap items-center gap-2 report-print-hidden">
        <Select onValueChange={setStatusFilter} value={statusFilter || 'all'}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                {status.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Поиск по записям"
          className="w-[220px]"
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Поиск по значениям…"
          value={searchInput}
        />
        {canEdit ? (
          <Button data-testid="registry-entry-create-open" onClick={() => setEditingEntry('new')}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Запись
          </Button>
        ) : null}
        {canEdit && selectedEntries.size > 0 ? (
          <div className="ml-auto flex flex-wrap items-center gap-2" data-testid="registry-bulk">
            <Typography tone="muted" variant="caption">
              Выбрано: {selectedEntries.size}
            </Typography>
            {statuses.map((status) => (
              <Button
                key={status.id}
                onClick={() => changeBulkStatus(status.id)}
                size="sm"
                variant="outline"
              >
                → {status.name}
              </Button>
            ))}
            <Button onClick={removeBulk} size="sm" variant="outline">
              <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
              Удалить
            </Button>
          </div>
        ) : null}
      </div>

      <div className="report-print-root" data-testid="registry-print-root">
        <div className="mb-3 hidden print:block">
          <Typography as="h2" variant="h3">
            {registry.name}
          </Typography>
          <Typography as="p" tone="muted" variant="caption">
            {detail?.name ?? ''} · {formatDateRu(new Date())}
          </Typography>
        </div>
        {entriesQuery.isPending ? (
          <Typography as="p" tone="muted" variant="bodySm">
            Загружаем записи…
          </Typography>
        ) : entries.length === 0 ? (
          <SurveyEmptyState
            action={
              canEdit ? (
                <Button onClick={() => setEditingEntry('new')} variant="outline">
                  <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                  Первая запись
                </Button>
              ) : undefined
            }
            description="Добавьте записи вручную или импортируйте вставкой из Excel."
            title="Записей нет"
          />
        ) : (
          <Table data-testid="registry-entries-table">
            <TableHeader>
              <TableRow>
                {canEdit ? (
                  <TableHead className="w-8 report-print-hidden">
                    <Checkbox
                      aria-label="Выбрать все записи"
                      checked={selectedEntries.size === entries.length && entries.length > 0}
                      onCheckedChange={(checked) =>
                        setSelectedEntries(checked === true ? new Set(entries.map((entry) => entry.id)) : new Set())
                      }
                    />
                  </TableHead>
                ) : null}
                {fields.map((field) => (
                  <TableHead key={field.id}>
                    {field.name}
                    {field.type === 'formula' && field.formula ? (
                      <Typography as="span" className="ml-1" tone="muted" variant="caption">
                        ({formulaLabel(field.formula, fields)})
                      </Typography>
                    ) : null}
                  </TableHead>
                ))}
                <TableHead>Статус</TableHead>
                {canEdit ? <TableHead className="w-0 report-print-hidden" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow data-testid="registry-entry-row" key={entry.id}>
                  {canEdit ? (
                    <TableCell className="report-print-hidden">
                      <Checkbox
                        aria-label="Выбрать запись"
                        checked={selectedEntries.has(entry.id)}
                        onCheckedChange={() => toggleEntry(entry.id)}
                      />
                    </TableCell>
                  ) : null}
                  {fields.map((field) => (
                    <TableCell key={field.id}>
                      <Typography
                        as="span"
                        className={field.type === 'formula' ? 'tabular-nums' : undefined}
                        variant="bodySm"
                      >
                        {entryFieldValue(entry, field)}
                      </Typography>
                    </TableCell>
                  ))}
                  <TableCell>
                    {entry.statusId && statusById.has(entry.statusId) ? (
                      <StatusChip color={statusById.get(entry.statusId)!.color}>
                        {statusById.get(entry.statusId)!.name}
                      </StatusChip>
                    ) : (
                      <Typography tone="muted">—</Typography>
                    )}
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="report-print-hidden">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          aria-label="Редактировать запись"
                          onClick={() => setEditingEntry(entry)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                        </Button>
                        <DeleteEntryButton entryId={entry.id} registryId={registry.id} />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {canEdit && editingEntry ? (
        <EntryDialog
          entry={editingEntry === 'new' ? null : editingEntry}
          onOpenChange={(open) => {
            if (!open) setEditingEntry(null)
          }}
          open
          registry={registry}
        />
      ) : null}
      {canEdit && importing ? (
        <ImportDialog
          onOpenChange={(open) => {
            if (!open) setImporting(false)
          }}
          open
          registry={registry}
        />
      ) : null}
    </div>
  )
}

function DeleteEntryButton({ entryId, registryId }: { entryId: string; registryId: string }) {
  const del = useDeleteRegistryEntryMutation(registryId)
  return (
    <Button
      aria-label="Удалить запись"
      onClick={() =>
        del.mutate(entryId, {
          onSuccess: () => toast.success('Запись удалена'),
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

/** Конструктор реестра: поля (тип + формула) и статусы (имя + цвет). */
function Constructor({ registry }: { registry: RegistryDto }) {
  const { projectId } = useSurveyProject()
  const [editingField, setEditingField] = useState<RegistryFieldDto | 'new' | null>(null)
  const [editingStatus, setEditingStatus] = useState<RegistryStatusDto | 'new' | null>(null)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-2 rounded-xl border p-4" data-testid="registry-fields">
        <div className="flex items-center justify-between gap-2">
          <Typography as="h3" variant="h4">
            Поля
          </Typography>
          <Button data-testid="registry-field-create-open" onClick={() => setEditingField('new')} size="sm" variant="outline">
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Поле
          </Button>
        </div>
        {registry.fields.length === 0 ? (
          <Typography as="p" tone="muted" variant="bodySm">
            Полей нет — добавьте первое (текст, число, дата, список или формула).
          </Typography>
        ) : (
          <div className="grid gap-1.5">
            {sortedFields(registry.fields).map((field) => (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" key={field.id}>
                <Typography as="span" truncate variant="control">
                  {field.name}
                </Typography>
                <StatusChip color="gray">{REGISTRY_FIELD_TYPE_META[field.type].label}</StatusChip>
                {field.type === 'formula' && field.formula ? (
                  <Typography as="span" className="truncate" tone="muted" variant="caption">
                    {formulaLabel(field.formula, registry.fields)}
                  </Typography>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    aria-label={`Редактировать поле «${field.name}»`}
                    onClick={() => setEditingField(field)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                  </Button>
                  <DeleteFieldButton fieldId={field.id} projectId={projectId} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid content-start gap-2 rounded-xl border p-4" data-testid="registry-statuses">
        <div className="flex items-center justify-between gap-2">
          <Typography as="h3" variant="h4">
            Статусы
          </Typography>
          <Button data-testid="registry-status-create-open" onClick={() => setEditingStatus('new')} size="sm" variant="outline">
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Статус
          </Button>
        </div>
        {registry.statuses.length === 0 ? (
          <Typography as="p" tone="muted" variant="bodySm">
            Статусов нет — записи можно переводить между ними вручную и массово.
          </Typography>
        ) : (
          <div className="grid gap-1.5">
            {sortedStatuses(registry.statuses).map((status) => (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" key={status.id}>
                <ColorDot color={status.color} />
                <Typography as="span" truncate variant="control">
                  {status.name}
                </Typography>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    aria-label={`Редактировать статус «${status.name}»`}
                    onClick={() => setEditingStatus(status)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                  </Button>
                  <DeleteStatusButton
                    projectId={projectId}
                    statusId={status.id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingField ? (
        <FieldDialog
          field={editingField === 'new' ? null : editingField}
          onOpenChange={(open) => {
            if (!open) setEditingField(null)
          }}
          open
          registry={registry}
        />
      ) : null}
      {editingStatus ? (
        <StatusDialog
          onOpenChange={(open) => {
            if (!open) setEditingStatus(null)
          }}
          open
          registry={registry}
          status={editingStatus === 'new' ? null : editingStatus}
        />
      ) : null}
    </div>
  )
}

function DeleteFieldButton({ fieldId, projectId }: { fieldId: string; projectId: string }) {
  const del = useDeleteRegistryFieldMutation(projectId)
  return (
    <Button
      aria-label="Удалить поле"
      onClick={() =>
        del.mutate(fieldId, {
          onSuccess: () => toast.success('Поле удалено'),
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

function DeleteStatusButton({ projectId, statusId }: { projectId: string; statusId: string }) {
  const del = useDeleteRegistryStatusMutation(projectId)
  return (
    <Button
      aria-label="Удалить статус"
      onClick={() =>
        del.mutate(statusId, {
          onSuccess: (result) =>
            toast.success(
              `Статус удалён; записей перемещено: ${result.movedCount}${
                result.movedTo ? ` → статус «${result.movedTo}»` : ''
              }`,
            ),
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

/** Поле: ключ, название, тип; для select — варианты, для formula — «a op b». */
function FieldDialog({
  onOpenChange,
  open,
  registry,
  field,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  registry: RegistryDto
  field: RegistryFieldDto | null
}) {
  const { projectId } = useSurveyProject()
  const createField = useCreateRegistryFieldMutation(projectId)
  const updateField = useUpdateRegistryFieldMutation(projectId)
  const [name, setName] = useState(field?.name ?? '')
  const [key, setKey] = useState(field?.key ?? '')
  const [type, setType] = useState<RegistryFieldDto['type']>(field?.type ?? 'text')
  const [options, setOptions] = useState((field?.options ?? []).join('\n'))
  const [operandA, setOperandA] = useState<FormulaOperand>(field?.formula?.a ?? { type: 'const', value: 0 })
  const [op, setOp] = useState(field?.formula?.op ?? '+')
  const [operandB, setOperandB] = useState<FormulaOperand>(field?.formula?.b ?? { type: 'const', value: 0 })
  const pending = createField.isPending || updateField.isPending

  const numberFields = sortedFields(registry.fields).filter(
    (candidate) => candidate.type === 'number' && candidate.id !== field?.id,
  )

  const effectiveKey = key.trim() || suggestFieldKey(name)

  const submit = () => {
    if (!name.trim() || !effectiveKey) return
    const base = {
      name: name.trim(),
      key: effectiveKey,
      type,
      options: type === 'select' ? options.split('\n').map((item) => item.trim()).filter(Boolean) : [],
    }
    const payload =
      type === 'formula'
        ? { ...base, formula: { op, a: operandA, b: operandB } }
        : { ...base, formula: null }
    const callbacks = {
      onSuccess: () => {
        toast.success(field ? 'Поле обновлено' : 'Поле создано')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (field) updateField.mutate({ fieldId: field.id, input: payload }, callbacks)
    else createField.mutate({ registryId: registry.id, input: payload }, callbacks)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{field ? 'Поле реестра' : 'Новое поле'}</DialogTitle>
          <DialogDescription>
            Ключ — латиница/цифры/_; формула считается по number-полям этого реестра.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="field-name">Название</FieldLabel>
              <Input
                data-testid="registry-field-name"
                id="field-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="field-key">Ключ</FieldLabel>
              <Input
                id="field-key"
                onChange={(event) => setKey(event.target.value)}
                placeholder={suggestFieldKey(name) || 'напр. qty'}
                value={key}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>Тип</FieldLabel>
            <Select onValueChange={(value) => setType(value as RegistryFieldDto['type'])} value={type}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REGISTRY_FIELD_TYPE_META) as RegistryFieldDto['type'][]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {REGISTRY_FIELD_TYPE_META[item].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {type === 'select' ? (
            <Field>
              <FieldLabel htmlFor="field-options">Варианты (по одному в строке)</FieldLabel>
              <Textarea
                id="field-options"
                onChange={(event) => setOptions(event.target.value)}
                rows={3}
                value={options}
              />
            </Field>
          ) : null}
          {type === 'formula' ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <FormulaOperandInput
                fields={numberFields}
                onChange={setOperandA}
                operand={operandA}
                title="Операнд A"
              />
              <Field>
                <FieldLabel>&nbsp;</FieldLabel>
                <Select onValueChange={(value) => setOp(value as '+' | '-' | '*')} value={op}>
                  <SelectTrigger className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="+">+</SelectItem>
                    <SelectItem value="-">−</SelectItem>
                    <SelectItem value="*">×</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <FormulaOperandInput
                fields={numberFields}
                onChange={setOperandB}
                operand={operandB}
                title="Операнд B"
              />
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button
            data-testid="registry-field-save"
            disabled={pending || !name.trim() || !effectiveKey}
            onClick={submit}
          >
            {field ? 'Сохранить' : 'Создать поле'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Один операнд формулы: поле реестра (number) или константа. */
function FormulaOperandInput({
  fields,
  onChange,
  operand,
  title,
}: {
  fields: ReadonlyArray<RegistryFieldDto>
  onChange: (operand: FormulaOperand) => void
  operand: FormulaOperand
  title: string
}) {
  return (
    <Field>
      <FieldLabel>{title}</FieldLabel>
      {operand.type === 'field' ? (
        <Select
          onValueChange={(value) =>
            onChange(value === '__const__' ? { type: 'const', value: 0 } : { type: 'field', key: value })
          }
          value={operand.key || undefined}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— нет number-полей —" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
              <SelectItem key={field.key} value={field.key}>
                {field.name}
              </SelectItem>
            ))}
            <SelectItem value="__const__">Константа…</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-1">
          <Input
            aria-label={`${title}: константа`}
            onChange={(event) => onChange({ type: 'const', value: Number(event.target.value) || 0 })}
            type="number"
            value={operand.value}
          />
          <Button
            onClick={() => onChange({ type: 'field', key: fields[0]?.key ?? '' })}
            size="sm"
            variant="outline"
          >
            Поле…
          </Button>
        </div>
      )}
    </Field>
  )
}

/** Статус записи: имя + цвет чипа. */
function StatusDialog({
  onOpenChange,
  open,
  registry,
  status,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  registry: RegistryDto
  status: RegistryStatusDto | null
}) {
  const { projectId } = useSurveyProject()
  const createStatus = useCreateRegistryStatusMutation(projectId)
  const updateStatus = useUpdateRegistryStatusMutation(projectId)
  const [name, setName] = useState(status?.name ?? '')
  const [color, setColor] = useState<ChipColor>(status?.color ?? 'blue')
  const pending = createStatus.isPending || updateStatus.isPending

  const submit = () => {
    if (!name.trim()) return
    const options = {
      onSuccess: () => {
        toast.success(status ? 'Статус обновлён' : 'Статус создан')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (status) {
      updateStatus.mutate({ statusId: status.id, input: { name: name.trim(), color } }, options)
    } else {
      createStatus.mutate({ registryId: registry.id, input: { name: name.trim(), color } }, options)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{status ? 'Статус' : 'Новый статус'}</DialogTitle>
          <DialogDescription>Статусы — столбцы жизненного цикла записи.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="status-name">Название</FieldLabel>
            <Input
              data-testid="registry-status-name"
              id="status-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          <Field>
            <FieldLabel>Цвет</FieldLabel>
            <Select onValueChange={(value) => setColor(value as ChipColor)} value={color}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHIP_COLORS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CHIP_COLOR_LABELS[item]}
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
          <Button data-testid="registry-status-save" disabled={pending || !name.trim()} onClick={submit}>
            {status ? 'Сохранить' : 'Создать статус'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Запись: значения по типам полей + статус; formula-поля показываются, но не редактируются. */
function EntryDialog({
  onOpenChange,
  open,
  registry,
  entry,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  registry: RegistryDto
  entry: RegistryEntryDto | null
}) {
  const createEntry = useCreateRegistryEntryMutation(registry.id)
  const updateEntry = useUpdateRegistryEntryMutation(registry.id)
  const [values, setValues] = useState<Record<string, string>>(
    entry ? entryInputFromValues(entry) : {},
  )
  const [statusId, setStatusId] = useState(entry?.statusId ?? registry.statuses[0]?.id ?? '')
  const fields = sortedFields(registry.fields)
  const statuses = sortedStatuses(registry.statuses)
  const pending = createEntry.isPending || updateEntry.isPending

  const setValue = (key: string, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }))

  const submit = () => {
    const payload = { values: entryValuesFromInput(fields, values), statusId: statusId || null }
    const options = {
      onSuccess: () => {
        toast.success(entry ? 'Запись обновлена' : 'Запись создана')
        onOpenChange(false)
      },
      onError: (error: Error) => toast.error(error.message),
    }
    if (entry) updateEntry.mutate({ entryId: entry.id, input: payload }, options)
    else createEntry.mutate(payload, options)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? 'Запись' : 'Новая запись'}</DialogTitle>
          <DialogDescription>
            Формулы считаются автоматически после сохранения.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {fields.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Сначала добавьте поля реестру.
            </Typography>
          ) : null}
          {fields.map((field) => (
            <Field key={field.id}>
              <FieldLabel htmlFor={`entry-${field.key}`}>
                {field.name}
                {field.type === 'formula' && field.formula
                  ? ` (${formulaLabel(field.formula, fields)})`
                  : ''}
              </FieldLabel>
              {field.type === 'text' ? (
                <Input
                  id={`entry-${field.key}`}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  value={values[field.key] ?? ''}
                />
              ) : null}
              {field.type === 'number' ? (
                <Input
                  id={`entry-${field.key}`}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  type="number"
                  value={values[field.key] ?? ''}
                />
              ) : null}
              {field.type === 'date' ? (
                <Input
                  id={`entry-${field.key}`}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  type="date"
                  value={values[field.key] ?? ''}
                />
              ) : null}
              {field.type === 'select' ? (
                <Select
                  onValueChange={(value) => setValue(field.key, value)}
                  value={values[field.key] || undefined}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {field.type === 'formula' ? (
                <Input
                  disabled
                  id={`entry-${field.key}`}
                  placeholder="вычисляется"
                  value={entry ? entryFieldValue(entry, field) : ''}
                />
              ) : null}
            </Field>
          ))}
          <Field>
            <FieldLabel>Статус</FieldLabel>
            <Select onValueChange={setStatusId} value={statusId || undefined}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— без статуса —" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.name}
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
          <Button data-testid="registry-entry-save" disabled={pending} onClick={submit}>
            {entry ? 'Сохранить' : 'Создать запись'}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Импорт из текста: вставка из Excel (таб или «;»), заголовок, маппинг колонок→поля. */
function ImportDialog({
  onOpenChange,
  open,
  registry,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  registry: RegistryDto
}) {
  const importEntries = useImportRegistryEntriesMutation(registry.id)
  const [text, setText] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  // Только правки пользователя: базовый маппинг считается из заголовков при рендере.
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [statusId, setStatusId] = useState(registry.statuses[0]?.id ?? '')

  const preview = useMemo(() => previewImport(text, hasHeader), [text, hasHeader])
  const fields = importableFields(registry)
  const mapping: Record<number, string> = {
    ...suggestMapping(preview.headers, registry),
    ...overrides,
  }

  const submit = () => {
    const apiMapping = mappingForApi(mapping)
    if (Object.keys(apiMapping).length === 0) {
      toast.error('Назначьте хотя бы одну колонку полю или статусу')
      return
    }
    importEntries.mutate(
      { text, hasHeader, mapping: apiMapping, statusId: statusId || undefined },
      {
        onSuccess: (result) => {
          toast.success(
            `Импортировано записей: ${result.created}` +
              (result.skipped.length > 0 ? `; пропущено строк: ${result.skipped.length}` : ''),
          )
          onOpenChange(false)
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импорт из текста</DialogTitle>
          <DialogDescription>
            Вставьте ячейки из Excel (разделитель — таб) или CSV с «;». Одна строка — одна запись.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="import-text">Данные</FieldLabel>
            <Textarea
              data-testid="registry-import-text"
              id="import-text"
              onChange={(event) => setText(event.target.value)}
              rows={6}
              value={text}
            />
          </Field>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={hasHeader}
              data-testid="registry-import-header"
              onCheckedChange={(checked) => setHasHeader(checked === true)}
            />
            <Typography as="span" variant="bodySm">
              Первая строка — заголовок
            </Typography>
          </label>
          {preview.headers.length > 0 ? (
            <div className="grid gap-2">
              <Typography as="h4" tone="muted" variant="control">
                Маппинг колонок (строк данных: {preview.rowCount})
              </Typography>
              {preview.headers.map((header, index) => (
                <div className="flex flex-wrap items-center gap-2" key={index}>
                  <Typography as="span" className="w-40 shrink-0 truncate" title={header} variant="bodySm">
                    {header}
                  </Typography>
                  <Select
                    onValueChange={(value) =>
                      setOverrides((previous) => ({ ...previous, [index]: value }))
                    }
                    value={mapping[index] ?? 'skip'}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">— пропустить —</SelectItem>
                      <SelectItem value="status">Статус (по названию)</SelectItem>
                      {fields.map((field) => (
                        <SelectItem key={field.key} value={field.key}>
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {preview.rows[0]?.[index] !== undefined ? (
                    <Typography as="span" className="truncate" tone="muted" variant="caption">
                      пример: {preview.rows[0][index]}
                    </Typography>
                  ) : null}
                </div>
              ))}
              <Field>
                <FieldLabel>Статус по умолчанию (если в колонке не распознан)</FieldLabel>
                <Select onValueChange={setStatusId} value={statusId || undefined}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— без статуса —" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedStatuses(registry.statuses).map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        {status.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Отмена
          </Button>
          <Button
            data-testid="registry-import-submit"
            disabled={importEntries.isPending || preview.rowCount === 0}
            onClick={submit}
          >
            Импортировать
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
