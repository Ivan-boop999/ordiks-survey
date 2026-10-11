import {
  ArrowRight01Icon,
  File01Icon,
  Image01Icon,
  Link02Icon,
  NoteIcon,
  PlusIcon,
  TrashIcon,
  Upload04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { FactDto } from '@ordiks-survey/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth'
import { CommentThread } from '../components/CommentThread'
import { formatDateRu } from '../model'
import { useSurveyProject } from '../use-survey-project'
import { factFileDownloadUrl } from '../api'
import {
  useCreateFactMutation,
  useDeleteFactMutation,
  useDomainGroupsQuery,
  useFactsQuery,
  useUploadFactFileMutation,
} from '../queries'

/** Факты: доказательства обследования — фото с площадки, файлы, заметки. */
export function FactsPage() {
  const { projectId, canEdit, detail } = useSurveyProject()
  const factsQuery = useFactsQuery(projectId)
  const groupsQuery = useDomainGroupsQuery(projectId)
  const [domainFilter, setDomainFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<FactDto | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const factTypes = detail?.settings.factTypes ?? []
  const items = factsQuery.data?.items
  const filtered = useMemo(
    () =>
      (items ?? []).filter(
        (fact) =>
          (!domainFilter || fact.domainId === domainFilter) &&
          (!typeFilter || fact.typeKey === typeFilter),
      ),
    [items, domainFilter, typeFilter],
  )

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button data-testid="fact-create-open" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Факт
            </Button>
          ) : undefined
        }
        description="Фото с площадки, файлы-выгрузки и заметки — всё с привязкой к домену, цеху и дате."
        title="Факты"
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
        <Select onValueChange={setTypeFilter} value={typeFilter || undefined}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Все типы" />
          </SelectTrigger>
          <SelectContent>
            {factTypes.map((type) => (
              <SelectItem key={type.key} value={type.key}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {factsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем факты…
        </Typography>
      ) : filtered.length === 0 ? (
        <SurveyEmptyState
          action={
            canEdit ? (
              <Button onClick={() => setCreating(true)} variant="outline">
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Первый факт
              </Button>
            ) : undefined
          }
          description="Доказательства обследования: фото с площадки, выгрузки, заметки."
          title="Фактов нет"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((fact) => (
            <button
              className="group overflow-hidden rounded-xl border text-left transition hover:border-primary/50 hover:shadow-sm"
              data-fact-title={fact.title}
              key={fact.id}
              onClick={() => setViewing(fact)}
              type="button"
            >
              {fact.kind === 'photo' && fact.objectKey ? (
                <FactPhoto factId={fact.id} title={fact.title} />
              ) : (
                <div className="flex h-32 items-center justify-center bg-muted/40 text-muted-foreground">
                  <HugeiconsIcon
                    icon={fact.kind === 'file' ? File01Icon : NoteIcon}
                    size={36}
                    strokeWidth={1.5}
                  />
                </div>
              )}
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Typography as="div" truncate variant="control">
                    {fact.title}
                  </Typography>
                  <FactKindChip fact={fact} />
                </div>
                <Typography as="p" tone="muted" truncate variant="caption">
                  {domains.find((d) => d.id === fact.domainId)?.name ?? '—'} · {fact.shop || '—'} ·{' '}
                  {formatDateRu(fact.factDate, true)}
                </Typography>
                {fact.findings.length > 0 ? (
                  <div className="flex items-center gap-1">
                    <StatusChip color="purple">
                      <HugeiconsIcon icon={Link02Icon} size={11} strokeWidth={2} />
                      находка
                    </StatusChip>
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {canEdit && creating ? (
        <FactDialog
          onOpenChange={(open) => {
            if (!open) setCreating(false)
          }}
          open
        />
      ) : null}
      {viewing ? (
        <FactViewDialog
          fact={viewing}
          onOpenChange={(open) => {
            if (!open) setViewing(null)
          }}
          onZoom={setZoom}
          open
        />
      ) : null}
      {zoom ? <ZoomOverlay onClose={() => setZoom(null)} url={zoom} /> : null}
    </PageContainer>
  )
}

function FactKindChip({ fact }: { fact: FactDto }) {
  const { detail } = useSurveyProject()
  const typeName = detail?.settings.factTypes.find((t) => t.key === fact.typeKey)?.name
  if (fact.kind === 'photo') {
    return (
      <StatusChip color="gray">
        <HugeiconsIcon icon={Image01Icon} size={11} strokeWidth={2} />
        {typeName ?? 'фото'}
      </StatusChip>
    )
  }
  if (fact.kind === 'file') {
    return (
      <StatusChip color="gray">
        <HugeiconsIcon icon={File01Icon} size={11} strokeWidth={2} />
        {typeName ?? 'файл'}
      </StatusChip>
    )
  }
  return <StatusChip color="gray">{typeName ?? 'заметка'}</StatusChip>
}

function FactPhoto({ factId, title }: { factId: string; title: string }) {
  const auth = useAuth()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    factFileDownloadUrl(auth.transport, factId)
      .then((result) => {
        if (alive) setUrl(result.url)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [auth.transport, factId])
  if (failed || !url) {
    return (
      <div className="flex h-32 items-center justify-center bg-muted/40 text-muted-foreground">
        <HugeiconsIcon icon={Image01Icon} size={36} strokeWidth={1.5} />
      </div>
    )
  }
  return <img alt={title} className="h-32 w-full object-cover" src={url} />
}

function FactViewDialog({
  open,
  onOpenChange,
  fact,
  onZoom,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fact: FactDto
  onZoom: (url: string) => void
}) {
  const auth = useAuth()
  const { canEdit } = useSurveyProject()
  const uploadFile = useUploadFactFileMutation(fact.projectId)
  const deleteFact = useDeleteFactMutation(fact.projectId)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (fact.objectKey) {
      factFileDownloadUrl(auth.transport, fact.id)
        .then((result) => setPhotoUrl(result.url))
        .catch(() => setPhotoUrl(null))
    }
  }, [auth.transport, fact.id, fact.objectKey])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{fact.title}</DialogTitle>
          <DialogDescription>
            {fact.shop || '—'} · {formatDateRu(fact.factDate, true)}
          </DialogDescription>
        </DialogHeader>
        {photoUrl && fact.kind === 'photo' ? (
          <button
            className="block w-full overflow-hidden rounded-lg"
            onClick={() => onZoom(photoUrl)}
            type="button"
          >
            <img alt={fact.title} className="w-full" src={photoUrl} />
          </button>
        ) : null}
        {fact.description ? (
          <Typography as="p" className="whitespace-pre-wrap" variant="bodySm">
            {fact.description}
          </Typography>
        ) : null}
        {photoUrl && fact.kind === 'file' && fact.fileName ? (
          <a className="text-primary underline" href={photoUrl}>
            {fact.fileName}
          </a>
        ) : null}
        {fact.findings.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {fact.findings.map((ref) => (
              <StatusChip key={ref.id} color="purple">
                находка: {ref.title}
              </StatusChip>
            ))}
          </div>
        ) : null}
        <CommentThread projectId={fact.projectId} threadId={fact.id} threadType="fact" />
        {canEdit ? (
          <DialogFooter>
            {fact.kind === 'photo' || fact.kind === 'file' ? (
              <>
                <input
                  accept="image/*,application/pdf,.xls,.xlsx,.doc,.docx"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    uploadFile.mutate(
                      { factId: fact.id, file },
                      {
                        onSuccess: () => toast.success('Файл загружен'),
                        onError: (error: Error) => toast.error(error.message),
                      },
                    )
                  }}
                  ref={fileInput}
                  type="file"
                />
                <Button
                  disabled={uploadFile.isPending}
                  onClick={() => fileInput.current?.click()}
                  variant="outline"
                >
                  <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />
                  {uploadFile.isPending ? 'Загружаем…' : fact.objectKey ? 'Заменить' : 'Загрузить'}
                </Button>
              </>
            ) : null}
            <Button
              onClick={() =>
                deleteFact.mutate(fact.id, {
                  onSuccess: () => {
                    toast.success('Факт удалён')
                    onOpenChange(false)
                  },
                  onError: (error: Error) => toast.error(error.message),
                })
              }
              variant="ghost"
            >
              <HugeiconsIcon icon={TrashIcon} strokeWidth={2} />
              Удалить
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ZoomOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  // Портал в body + z-[100]: лайтбокс обязан перекрывать модалку факта — её диалог-портал
  // (z-50) рендерится в конце body и иначе ложится поверх затемнения и перехватывает клики.
  return createPortal(
    <div
      // pointer-events-auto: открытый диалог ставит body pointer-events:none,
      // без этого лайтбокс не реагировал бы на клики вовсе.
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="presentation"
    >
      <img alt="" className="max-h-full max-w-full rounded-lg" src={url} />
    </div>,
    document.body,
  )
}

function FactDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { projectId, detail } = useSurveyProject()
  const groupsQuery = useDomainGroupsQuery(projectId)
  const createFact = useCreateFactMutation(projectId)
  const uploadFile = useUploadFactFileMutation(projectId)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const domains = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const factTypes = detail?.settings.factTypes ?? []
  const shops = detail?.shops ?? []

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'photo' | 'file' | 'note'>('photo')
  const [typeKey, setTypeKey] = useState('')
  const [domainId, setDomainId] = useState('')
  const [shop, setShop] = useState('')
  const [createdFactId, setCreatedFactId] = useState<string | null>(null)

  const submit = () => {
    if (!title.trim()) return
    createFact.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        kind,
        typeKey: typeKey || kind,
        domainId: domainId || null,
        shop: shop || '',
      },
      {
        onSuccess: (fact) => {
          toast.success('Факт создан')
          if (kind === 'note') onOpenChange(false)
          else setCreatedFactId(fact.id)
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый факт</DialogTitle>
          <DialogDescription>Доказательство: фото, файл или заметка.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fact-title">Название</FieldLabel>
            <Input
              data-testid="fact-title"
              id="fact-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="fact-description">Описание</FieldLabel>
            <Textarea
              id="fact-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Тип</FieldLabel>
              <Select
                onValueChange={(value) => {
                  const selected = factTypes.find((t) => t.key === value)
                  setKind(selected?.kind ?? 'note')
                  setTypeKey(value)
                }}
                value={typeKey || undefined}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {factTypes.map((type) => (
                    <SelectItem key={type.key} value={type.key}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Field>
              <FieldLabel>Цех</FieldLabel>
              <Select onValueChange={setShop} value={shop || undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>
        {createdFactId ? (
          <div className="space-y-2">
            <Typography as="p" tone="muted" variant="caption">
              Факт создан — выберите файл для загрузки.
            </Typography>
            <input
              accept="image/*,application/pdf,.xls,.xlsx,.doc,.docx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                uploadFile.mutate(
                  { factId: createdFactId, file },
                  {
                    onSuccess: () => {
                      toast.success('Файл загружен')
                      onOpenChange(false)
                    },
                    onError: (error: Error) => toast.error(error.message),
                  },
                )
              }}
              ref={fileInput}
              type="file"
            />
            <Button disabled={uploadFile.isPending} onClick={() => fileInput.current?.click()}>
              <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />
              {uploadFile.isPending ? 'Загружаем…' : 'Выбрать файл'}
            </Button>
          </div>
        ) : (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} variant="ghost">
              Отмена
            </Button>
            <Button data-testid="fact-save" disabled={createFact.isPending || !title.trim()} onClick={submit}>
              Создать
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
