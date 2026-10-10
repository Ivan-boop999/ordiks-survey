import { PlusIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ProjectSummary } from '@ordiks-survey/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ProgressBar, StatusChip, SurveyEmptyState } from '@/components/survey'
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth'
import { isTeamOrgRole, PROJECT_STATUS_META, sectionPath } from '../model'
import {
  useArchiveProjectMutation,
  useCreateProjectMutation,
  useProjectsQuery,
  useProjectCoverage,
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
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем проекты…
        </Typography>
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
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate(
                  { projectId: project.id, status: 'archived' },
                  { onSuccess: () => toast.success('Проект в архиве') },
                )
              }
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
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [city, setCity] = useState('')
  const [shops, setShops] = useState('')
  const [error, setError] = useState<string | null>(null)

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
    create.mutate(
      {
        name: name.trim(),
        client: client.trim(),
        city: city.trim(),
        shops: shopsList,
        boundaries: '',
        goals: '',
      },
      {
        onSuccess: () => {
          toast.success('Проект создан')
          onOpenChange(false)
          setName('')
          setClient('')
          setCity('')
          setShops('')
        },
        onError: (mutationError) => {
          setError(
            mutationError instanceof Error ? mutationError.message : 'Не удалось создать проект',
          )
        },
      },
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
            <FieldLabel htmlFor="project-template">Шаблон</FieldLabel>
            <Input disabled id="project-template" value="Пустой проект" />
            {/* TODO(B3): список шаблонов из API, когда появится GET /api/templates. */}
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
          <Button data-testid="project-create-submit" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Создаём…' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
