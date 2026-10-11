import { PlusIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ProjectSummary } from '@ordiks-survey/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ConfirmDeleteDialog, ProgressBar, StatusChip, SurveyCardsSkeleton, SurveyEmptyState } from '@/components/survey'
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
import { isTeamOrgRole, pluralRu, PROJECT_STATUS_META, sectionPath } from '../model'
import {
  useArchiveProjectMutation,
  useCreateProjectFromTemplateMutation,
  useCreateProjectMutation,
  useProjectCoverage,
  useProjectsQuery,
  useProjectTemplatesQuery,
} from '../queries'

/**
 * Список проектов: карточки с прогрессом покрытия доменов, архивация/восстановление,
 * создание (команда ОРДИКС). Прогресс считается по чек-листам доменов каждого проекта.
 */
export function ProjectsPage() {
  const auth = useAuth()
  // Страница живёт под авторизованной оболочкой /survey; пользователь есть всегда.
  const isTeam = isTeamOrgRole((auth.user as NonNullable<typeof auth.user>).orgRole)
  const projectsQuery = useProjectsQuery()
  const [createOpen, setCreateOpen] = useState(false)

  const projects = projectsQuery.data?.items ?? []

  return (
    <PageContainer>
      <PageHeader
        actions={
          isTeam ? (
            <Button data-testid="project-create-open" onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Новый проект
            </Button>
          ) : undefined
        }
        description="Проекты обследования, доступные вам. Прогресс — по чек-листам доменов."
        title="Проекты"
      />

      {projectsQuery.isPending ? (
        <SurveyCardsSkeleton cards={3} />
      ) : projectsQuery.isError ? (
        <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
          Не удалось загрузить проекты. Попробуйте обновить страницу.
        </Typography>
      ) : projects.length === 0 ? (
        <SurveyEmptyState
          action={
            isTeam ? (
              <Button data-testid="project-create-empty" onClick={() => setCreateOpen(true)}>
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Создать первый проект
              </Button>
            ) : undefined
          }
          description="Вас пока не добавили ни в один проект — попросите команду ОРДИКС прислать приглашение."
          title="Проектов пока нет"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard isTeam={isTeam} key={project.id} project={project} />
          ))}
        </div>
      )}

      {isTeam ? <CreateProjectDialog onOpenChange={setCreateOpen} open={createOpen} /> : null}
    </PageContainer>
  )
}

function ProjectCard({ isTeam, project }: { isTeam: boolean; project: ProjectSummary }) {
  const coverage = useProjectCoverage(project.id)
  const archive = useArchiveProjectMutation()
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const statusMeta = PROJECT_STATUS_META[project.status]

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
      data-testid="project-card"
    >
      <div className="flex items-start justify-between gap-2">
        <Link className="min-w-0 hover:underline" to={sectionPath(project.id, 'dashboard')}>
          <Typography as="span" truncate variant="bodySmMedium">
            {project.name}
          </Typography>
        </Link>
        <StatusChip color={statusMeta.color}>{statusMeta.label}</StatusChip>
      </div>
      <Typography as="p" tone="muted" variant="bodySm">
        {[project.client || null, project.city || null].filter(Boolean).join(' · ') || '—'}
      </Typography>
      <div className="mt-auto grid gap-1">
        <div className="flex items-center justify-between">
          <Typography as="span" tone="muted" variant="caption">
            Покрытие доменов
          </Typography>
          <Typography as="span" className="tabular-nums" variant="bodySmMedium">
            {coverage.percent}%
          </Typography>
        </div>
        <ProgressBar done={coverage.done} max={coverage.total} />
      </div>
      {isTeam ? (
        <div className="flex justify-end gap-2">
          {project.status === 'active' ? (
            <Button
              onClick={() => setConfirmingArchive(true)}
              size="sm"
              variant="ghost"
            >
              В архив
            </Button>
          ) : (
            <Button
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate(
                  { projectId: project.id, status: 'active' },
                  { onSuccess: () => toast.success('Проект восстановлен') },
                )
              }
              size="sm"
              variant="outline"
            >
              Восстановить
            </Button>
          )}
        </div>
      ) : null}
      <ConfirmDeleteDialog
        confirmLabel="В архив"
        destructive={false}
        description="Проект скроется из списка активных; восстановить можно будет в любой момент."
        onConfirm={() =>
          archive.mutate(
            { projectId: project.id, status: 'archived' },
            {
              onSuccess: () => {
                toast.success('Проект в архиве')
                setConfirmingArchive(false)
              },
            },
          )
        }
        onOpenChange={setConfirmingArchive}
        open={confirmingArchive}
        pending={archive.isPending}
        title={`Переместить проект «${project.name}» в архив?`}
      />
    </div>
  )
}

function CreateProjectDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const create = useCreateProjectMutation()
  const createFromTemplate = useCreateProjectFromTemplateMutation()
  const templatesQuery = useProjectTemplatesQuery()
  const navigate = useNavigate()
  const templates = templatesQuery.data?.items ?? []
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [city, setCity] = useState('')
  const [shops, setShops] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [error, setError] = useState<string | null>(null)

  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null
  const pending = create.isPending || createFromTemplate.isPending

  const submit = () => {
    setError(null)
    if (name.trim().length < 2) {
      setError('Название проекта — минимум 2 символа.')
      return
    }
    const shopsList = shops
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const options = {
      // Автопереход в созданный проект: раньше пользователь оставался в списке
      // и не понимал, что произошло (аудит).
      onSuccess: (project: { id: string }) => {
        toast.success('Проект создан')
        onOpenChange(false)
        setName('')
        setClient('')
        setCity('')
        setShops('')
        setTemplateId('blank')
        void navigate({ to: sectionPath(project.id, 'dashboard') })
      },
      onError: (mutationError: Error) => {
        setError(mutationError.message || 'Не удалось создать проект')
      },
    }
    if (selectedTemplate) {
      createFromTemplate.mutate(
        {
          templateId: selectedTemplate.id,
          name: name.trim(),
          client: client.trim(),
          city: city.trim(),
          shops: shopsList,
        },
        options,
      )
      return
    }
    create.mutate(
      {
        name: name.trim(),
        client: client.trim(),
        city: city.trim(),
        shops: shopsList,
        boundaries: '',
        goals: '',
      },
      options,
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый проект</DialogTitle>
          <DialogDescription>
            Паспорт можно дополнить позже; структура доменов и этапов — из шаблона.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="project-name">Название *</FieldLabel>
            <Input
              data-testid="project-name"
              id="project-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="ЖБИ-завод, Казань"
              value={name}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="project-client">Заказчик</FieldLabel>
              <Input
                id="project-client"
                onChange={(event) => setClient(event.target.value)}
                placeholder="ООО «Завод»"
                value={client}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-city">Город</FieldLabel>
              <Input
                id="project-city"
                onChange={(event) => setCity(event.target.value)}
                placeholder="Уфа"
                value={city}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="project-shops">Цеха и подразделения</FieldLabel>
            <Textarea
              id="project-shops"
              onChange={(event) => setShops(event.target.value)}
              placeholder={'По одному в строке:\nЦех плит\nПДО\nЛаборатория'}
              value={shops}
            />
          </Field>
          <Field>
            <FieldLabel>Шаблон</FieldLabel>
            <Select onValueChange={setTemplateId} value={templateId}>
              <SelectTrigger aria-label="Шаблон проекта" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">Пустой проект</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Typography as="p" tone="muted" variant="caption">
              {selectedTemplate
                ? templateSummary(selectedTemplate)
                : 'Этапы и домены добавите вручную на разделах «Этапы» и «Домены».'}
            </Typography>
          </Field>
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
          <Button data-testid="project-create-submit" disabled={pending} onClick={submit}>
            {pending ? 'Создаём…' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Краткое описание шаблона под селектором: этапы, домены, гайды. */
function templateSummary(template: {
  description: string
  payload: { stageNames: string[]; domains: { name: string }[]; guides: { name: string }[] }
}): string {
  const parts: string[] = []
  if (template.payload.stageNames.length > 0) {
    parts.push(
      `${template.payload.stageNames.length} ${pluralRu(template.payload.stageNames.length, 'этап', 'этапа', 'этапов')}`,
    )
  }
  if (template.payload.domains.length > 0) {
    parts.push(
      `${template.payload.domains.length} ${pluralRu(template.payload.domains.length, 'домен', 'домена', 'доменов')}`,
    )
  }
  if (template.payload.guides.length > 0) {
    parts.push(
      `${template.payload.guides.length} ${pluralRu(template.payload.guides.length, 'гайд', 'гайда', 'гайдов')}`,
    )
  }
  const summary = parts.join(' · ')
  if (template.description.trim()) {
    return summary ? `${template.description.trim()} · ${summary}` : template.description.trim()
  }
  return summary || 'Методика из библиотеки шаблонов.'
}
