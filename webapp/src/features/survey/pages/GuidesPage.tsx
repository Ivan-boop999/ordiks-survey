import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Copy01Icon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GuideDto, GuideQuestionDto, GuideSectionDto } from '@ordiks-survey/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { ConfirmDeleteDialog, StatusChip, SurveyCardsSkeleton, SurveyEmptyState } from '@/components/survey'
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
  GUIDE_QUESTION_TYPE_LABELS,
  conditionLabel,
  conditionOptions,
  draftFromQuestion,
  questionPayloadFromDraft,
  questionTypeHasOptions,
  questionUpdatePayloadFromDraft,
  guideStats,
  type QuestionFormDraft,
  type QuestionFormErrors,
} from '../guide-model'
import { pluralRu } from '../model'
import {
  useCreateGuideMutation,
  useCreateGuideQuestionMutation,
  useCreateGuideSectionMutation,
  useDeleteGuideMutation,
  useDeleteGuideQuestionMutation,
  useDeleteGuideSectionMutation,
  useDuplicateGuideMutation,
  useGuidesQuery,
  useInterviewsQuery,
  useMoveGuideQuestionMutation,
  useMoveGuideSectionMutation,
  useUpdateGuideMutation,
  useUpdateGuideQuestionMutation,
  useUpdateGuideSectionMutation,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

/** Гайды-опросники: библиотека карточек и конструктор (секции, вопросы, условия показа). */
export function GuidesPage() {
  const { projectId } = useSurveyProject()
  const guidesQuery = useGuidesQuery(projectId)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<GuideDto | null>(null)

  const guides = guidesQuery.data?.items ?? []

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button data-testid="guide-create-open" onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Новый гайд
          </Button>
        }
        description="Опросники для интервью: секции, вопросы и условный показ. Дублируйте гайд под нового респондента."
        title="Гайды"
      />

      {guidesQuery.isPending ? (
        <SurveyCardsSkeleton cards={3} />
      ) : guidesQuery.isError ? (
        <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
          Не удалось загрузить гайды. Попробуйте обновить страницу.
        </Typography>
      ) : guides.length === 0 ? (
        <SurveyEmptyState
          action={
            <Button onClick={() => setCreating(true)} variant="outline">
              <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
              Первый гайд
            </Button>
          }
          description="Соберите опросник из секций и вопросов — интервью по гайду покажет вопросы с учётом условий."
          title="Гайдов пока нет"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {guides.map((guide) => (
            <GuideCard key={guide.id} onEdit={() => setEditing(guide)} guide={guide} />
          ))}
        </div>
      )}

      {creating ? (
        <GuideCreateDialog
          onOpenChange={(open) => {
            if (!open) setCreating(false)
          }}
          open
        />
      ) : null}
      {editing ? (
        <GuideConstructorDialog
          guide={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          open
        />
      ) : null}
    </PageContainer>
  )
}

function GuideCard({ guide, onEdit }: { guide: GuideDto; onEdit: () => void }) {
  const { projectId } = useSurveyProject()
  const stats = guideStats(guide)
  const duplicate = useDuplicateGuideMutation(projectId)
  const remove = useDeleteGuideMutation(projectId)
  const interviewsQuery = useInterviewsQuery(projectId)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const linkedInterviews = (interviewsQuery.data?.items ?? []).filter(
    (interview) => interview.guideId === guide.id,
  ).length

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
      data-testid="guide-card"
    >
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 text-left hover:underline" data-testid="guide-open" onClick={onEdit} type="button">
          <Typography as="span" truncate variant="bodySmMedium">
            {guide.name}
          </Typography>
        </button>
        <StatusChip outline>
          {stats.sections} {pluralRu(stats.sections, 'секция', 'секции', 'секций')}
        </StatusChip>
      </div>
      <Typography as="p" tone="muted" variant="bodySm">
        {stats.questions} {pluralRu(stats.questions, 'вопрос', 'вопроса', 'вопросов')}
      </Typography>
      <div className="mt-auto flex flex-wrap justify-end gap-2">
        <Button onClick={onEdit} size="sm" variant="outline">
          <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
          Конструктор
        </Button>
        <Button
          data-testid="guide-duplicate"
          disabled={duplicate.isPending}
          onClick={() =>
            duplicate.mutate(guide.id, {
              onSuccess: () => toast.success('Гайд скопирован'),
              onError: (error) => toast.error(error.message),
            })
          }
          size="sm"
          variant="ghost"
        >
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          Дубль
        </Button>
        <Button
          aria-label={`Удалить гайд «${guide.name}»`}
          data-testid="guide-delete"
          onClick={() => setConfirmingDelete(true)}
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
        </Button>
      </div>
      <ConfirmDeleteDialog
        description={
          linkedInterviews > 0
            ? `Гайд используется в ${linkedInterviews} ${pluralRu(linkedInterviews, 'интервью', 'интервью', 'интервью')}; секции и вопросы будут удалены.`
            : 'Секции и вопросы будут удалены безвозвратно.'
        }
        onConfirm={() =>
          remove.mutate(guide.id, {
            onSuccess: () => toast.success('Гайд удалён'),
            onError: (error) => toast.error(error.message),
          })
        }
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        pending={remove.isPending}
        title={`Удалить гайд «${guide.name}»?`}
      />
    </div>
  )
}

function GuideCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { projectId } = useSurveyProject()
  const create = useCreateGuideMutation(projectId)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    if (name.trim().length === 0) {
      setError('Название гайда обязательно.')
      return
    }
    create.mutate(
      { name: name.trim(), sections: [] },
      {
        onSuccess: () => {
          toast.success('Гайд создан')
          onOpenChange(false)
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый гайд</DialogTitle>
          <DialogDescription>Секции и вопросы добавляются в конструкторе.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="guide-name">Название *</FieldLabel>
            <Input
              data-testid="guide-name"
              id="guide-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Интервью с начальником цеха"
              value={name}
            />
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
          <Button data-testid="guide-create-submit" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Создаём…' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Диалог переименования (гайда или секции). */
function RenameDialog({
  open,
  onOpenChange,
  initialName,
  title,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  title: string
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(initialName)
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="rename-input">Название</FieldLabel>
          <Input
            autoFocus
            data-testid="rename-input"
            id="rename-input"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </Field>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Отмена
          </Button>
          <Button
            data-testid="rename-submit"
            disabled={name.trim().length === 0}
            onClick={() => {
              onSubmit(name.trim())
              onOpenChange(false)
            }}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GuideConstructorDialog({
  guide,
  onOpenChange,
  open,
}: {
  guide: GuideDto
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { projectId } = useSurveyProject()
  const createSection = useCreateGuideSectionMutation(projectId)
  const [renaming, setRenaming] = useState(false)
  const [addingSection, setAddingSection] = useState(false)
  const [sectionTitle, setSectionTitle] = useState('')
  const [questionEditor, setQuestionEditor] = useState<{
    sectionId: string
    question: GuideQuestionDto | null
  } | null>(null)

  const rename = useUpdateGuideMutation(projectId)

  const sections = guide.sections

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{guide.name}</span>
            <Button
              aria-label="Переименовать гайд"
              onClick={() => setRenaming(true)}
              size="icon-xs"
              variant="ghost"
            >
              <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Секции с вопросами; ↑↓ меняют порядок, условие показа прячет вопрос до нужного ответа.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1" data-testid="guide-sections">
          {sections.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Секций пока нет — добавьте первую.
            </Typography>
          ) : (
            sections.map((section, index) => (
              <SectionEditor
                guide={guide}
                key={section.id}
                onAddQuestion={() => setQuestionEditor({ sectionId: section.id, question: null })}
                onEditQuestion={(question) =>
                  setQuestionEditor({ sectionId: section.id, question })
                }
                section={section}
                showMoveDown={index < sections.length - 1}
                showMoveUp={index > 0}
              />
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            data-testid="guide-section-add"
            onClick={() => setAddingSection(true)}
            variant="outline"
          >
            <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
            Секция
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Закрыть
          </Button>
        </DialogFooter>

        {renaming ? (
          <RenameDialog
            initialName={guide.name}
            onOpenChange={(openValue) => {
              if (!openValue) setRenaming(false)
            }}
            onSubmit={(name) =>
              rename.mutate(
                { guideId: guide.id, input: { name } },
                {
                  onSuccess: () => toast.success('Гайд переименован'),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
            open
            title="Переименовать гайд"
          />
        ) : null}

        {addingSection ? (
          <Dialog
            onOpenChange={(openValue) => {
              if (!openValue) setAddingSection(false)
            }}
            open
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Новая секция</DialogTitle>
              </DialogHeader>
              <Field>
                <FieldLabel htmlFor="section-title">Название *</FieldLabel>
                <Input
                  data-testid="section-title"
                  id="section-title"
                  onChange={(event) => setSectionTitle(event.target.value)}
                  placeholder="Общие вопросы"
                  value={sectionTitle}
                />
              </Field>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setAddingSection(false)
                    setSectionTitle('')
                  }}
                  variant="outline"
                >
                  Отмена
                </Button>
                <Button
                  data-testid="section-create-submit"
                  disabled={createSection.isPending || sectionTitle.trim().length === 0}
                  onClick={() =>
                    createSection.mutate(
                      { guideId: guide.id, input: { title: sectionTitle.trim() } },
                      {
                        onSuccess: () => {
                          toast.success('Секция добавлена')
                          setSectionTitle('')
                          setAddingSection(false)
                        },
                        onError: (error) => toast.error(error.message),
                      },
                    )
                  }
                >
                  Добавить
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        {questionEditor ? (
          <QuestionDialog
            guide={guide}
            onOpenChange={(openValue) => {
              if (!openValue) setQuestionEditor(null)
            }}
            open
            question={questionEditor.question}
            sectionId={questionEditor.sectionId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SectionEditor({
  guide,
  section,
  showMoveUp,
  showMoveDown,
  onAddQuestion,
  onEditQuestion,
}: {
  guide: GuideDto
  section: GuideSectionDto
  showMoveUp: boolean
  showMoveDown: boolean
  onAddQuestion: () => void
  onEditQuestion: (question: GuideQuestionDto) => void
}) {
  const { projectId } = useSurveyProject()
  const rename = useUpdateGuideSectionMutation(projectId)
  const remove = useDeleteGuideSectionMutation(projectId)
  const move = useMoveGuideSectionMutation(projectId)
  const moveQuestion = useMoveGuideQuestionMutation(projectId)
  const removeQuestion = useDeleteGuideQuestionMutation(projectId)
  const [renaming, setRenaming] = useState(false)
  const [confirmingSection, setConfirmingSection] = useState(false)
  const [confirmingQuestion, setConfirmingQuestion] = useState<GuideQuestionDto | null>(null)

  const questions = section.questions

  return (
    <div className="rounded-xl border p-3" data-testid="guide-section">
      <div className="flex items-center gap-1">
        <Typography as="p" className="flex-1 truncate" variant="bodySmMedium">
          {section.title}
        </Typography>
        <Button
          aria-label={`Переместить секцию «${section.title}» выше`}
          disabled={!showMoveUp || move.isPending}
          onClick={() => move.mutate({ sections: guide.sections, index: guide.sections.indexOf(section), direction: -1 })}
          size="icon-xs"
          variant="ghost"
        >
          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
        </Button>
        <Button
          aria-label={`Переместить секцию «${section.title}» ниже`}
          disabled={!showMoveDown || move.isPending}
          onClick={() => move.mutate({ sections: guide.sections, index: guide.sections.indexOf(section), direction: 1 })}
          size="icon-xs"
          variant="ghost"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
        </Button>
        <Button
          aria-label={`Переименовать секцию «${section.title}»`}
          onClick={() => setRenaming(true)}
          size="icon-xs"
          variant="ghost"
        >
          <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
        </Button>
        <Button
          aria-label={`Удалить секцию «${section.title}»`}
          onClick={() => setConfirmingSection(true)}
          size="icon-xs"
          variant="ghost"
        >
          <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
        </Button>
      </div>

      <div className="mt-2 grid gap-1.5" data-testid="guide-questions">
        {questions.length === 0 ? (
          <Typography as="p" tone="muted" variant="caption">
            Вопросов нет.
          </Typography>
        ) : (
          questions.map((question, index) => {
            const condition = conditionLabel(guide, question)
            return (
              <div
                className="flex items-start gap-1 rounded-lg border bg-muted/40 px-2.5 py-1.5"
                data-testid="guide-question"
                key={question.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip outline>{GUIDE_QUESTION_TYPE_LABELS[question.type]}</StatusChip>
                    {condition ? (
                      <span data-testid="guide-question-condition">
                        <StatusChip color="purple">{condition}</StatusChip>
                      </span>
                    ) : null}
                  </div>
                  <Typography as="p" className="mt-1" variant="bodySm">
                    {question.text}
                  </Typography>
                  {questionTypeHasOptions(question.type) && question.options.length > 0 ? (
                    <Typography as="p" tone="muted" truncate variant="caption">
                      {question.options.join(' · ')}
                    </Typography>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    aria-label={`Переместить вопрос «${question.text}» выше`}
                    disabled={index === 0 || moveQuestion.isPending}
                    onClick={() =>
                      moveQuestion.mutate({ questions, index, direction: -1 })
                    }
                    size="icon-xs"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    aria-label={`Переместить вопрос «${question.text}» ниже`}
                    disabled={index === questions.length - 1 || moveQuestion.isPending}
                    onClick={() =>
                      moveQuestion.mutate({ questions, index, direction: 1 })
                    }
                    size="icon-xs"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    aria-label={`Редактировать вопрос «${question.text}»`}
                    onClick={() => onEditQuestion(question)}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={PencilIcon} strokeWidth={2} />
                  </Button>
                  <Button
                    aria-label={`Удалить вопрос «${question.text}»`}
                    onClick={() => setConfirmingQuestion(question)}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <HugeiconsIcon className="text-red-600" icon={TrashIcon} strokeWidth={2} />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <Button className="mt-2" onClick={onAddQuestion} size="sm" variant="ghost">
        <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
        Вопрос
      </Button>

      {renaming ? (
        <RenameDialog
          initialName={section.title}
          onOpenChange={(openValue) => {
            if (!openValue) setRenaming(false)
          }}
          onSubmit={(title) =>
            rename.mutate(
              { sectionId: section.id, input: { title } },
              {
                onSuccess: () => toast.success('Секция переименована'),
                onError: (error) => toast.error(error.message),
              },
            )
          }
          open
          title="Переименовать секцию"
        />
      ) : null}

      <ConfirmDeleteDialog
        description={`Будут удалены все вопросы секции (${questions.length}).`}
        onConfirm={() =>
          remove.mutate(section.id, {
            onSuccess: () => toast.success('Секция удалена'),
            onError: (error) => toast.error(error.message),
          })
        }
        onOpenChange={setConfirmingSection}
        open={confirmingSection}
        pending={remove.isPending}
        title={`Удалить секцию «${section.title}»?`}
      />
      <ConfirmDeleteDialog
        onConfirm={() => {
          if (!confirmingQuestion) return
          removeQuestion.mutate(confirmingQuestion.id, {
            onSuccess: () => toast.success('Вопрос удалён'),
            onError: (error) => toast.error(error.message),
          })
        }}
        onOpenChange={(open) => {
          if (!open) setConfirmingQuestion(null)
        }}
        open={confirmingQuestion !== null}
        pending={removeQuestion.isPending}
        title={confirmingQuestion ? `Удалить вопрос «${confirmingQuestion.text}»?` : ''}
      />
    </div>
  )
}

function QuestionDialog({
  guide,
  sectionId,
  question,
  onOpenChange,
  open,
}: {
  guide: GuideDto
  sectionId: string
  question: GuideQuestionDto | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { projectId } = useSurveyProject()
  const createQuestion = useCreateGuideQuestionMutation(projectId)
  const updateQuestion = useUpdateGuideQuestionMutation(projectId)
  const [draft, setDraft] = useState<QuestionFormDraft>(() => draftFromQuestion(question))
  const [errors, setErrors] = useState<QuestionFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const conditions = conditionOptions(guide, question?.id ?? null)
  const pending = createQuestion.isPending || updateQuestion.isPending

  const submit = () => {
    setServerError(null)
    if (question) {
      const result = questionUpdatePayloadFromDraft(draft)
      if (result.payload === null) {
        setErrors(result.errors)
        return
      }
      setErrors({})
      updateQuestion.mutate(
        { questionId: question.id, input: result.payload },
        {
          onSuccess: () => {
            toast.success('Вопрос обновлён')
            onOpenChange(false)
          },
          onError: (error) => setServerError(error.message),
        },
      )
      return
    }
    const result = questionPayloadFromDraft(draft)
    if (result.payload === null) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    createQuestion.mutate(
      { sectionId, input: result.payload },
      {
        onSuccess: () => {
          toast.success('Вопрос добавлен')
          onOpenChange(false)
        },
        onError: (error) => setServerError(error.message),
      },
    )
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{question ? 'Редактировать вопрос' : 'Новый вопрос'}</DialogTitle>
          <DialogDescription>
            Тип, текст и варианты. Условие показа скрывает вопрос, пока ответ-источник не равен выбранному значению.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.text)}>
              <FieldLabel htmlFor="question-text">Текст вопроса *</FieldLabel>
              <Input
                aria-invalid={Boolean(errors.text)}
                data-testid="question-text"
                id="question-text"
                onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
                placeholder="Как планируются закупки?"
                value={draft.text}
              />
              {errors.text ? (
                <Typography as="p" className="text-red-600" variant="caption">
                  {errors.text}
                </Typography>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>Тип ответа</FieldLabel>
              <Select
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, type: value as QuestionFormDraft['type'] }))
                }
                value={draft.type}
              >
                <SelectTrigger aria-label="Тип ответа" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GUIDE_QUESTION_TYPE_LABELS) as QuestionFormDraft['type'][]).map(
                    (type) => (
                      <SelectItem key={type} value={type}>
                        {GUIDE_QUESTION_TYPE_LABELS[type]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {questionTypeHasOptions(draft.type) ? (
            <Field data-invalid={Boolean(errors.options)}>
              <FieldLabel htmlFor="question-options">Варианты (по одному в строке) *</FieldLabel>
              <Textarea
                aria-invalid={Boolean(errors.options)}
                data-testid="question-options"
                id="question-options"
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, optionsText: event.target.value }))
                }
                placeholder={'Excel\n1С\nНа бумаге'}
                rows={4}
                value={draft.optionsText}
              />
              {errors.options ? (
                <Typography as="p" className="text-red-600" variant="caption">
                  {errors.options}
                </Typography>
              ) : null}
            </Field>
          ) : null}

          <Field data-invalid={Boolean(errors.condition)}>
            <FieldLabel>Условие показа</FieldLabel>
            <Select
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, condition: value === 'always' ? '' : value }))
              }
              value={draft.condition || 'always'}
            >
              <SelectTrigger aria-label="Условие показа" className="w-full">
                <SelectValue placeholder="Показывать всегда" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Показывать всегда</SelectItem>
                {conditions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.condition ? (
              <Typography as="p" className="text-red-600" variant="caption">
                {errors.condition}
              </Typography>
            ) : null}
            {conditions.length === 0 ? (
              <Typography as="p" tone="muted" variant="caption">
                Предшествующих вопросов с да/нет или выбором пока нет — условие задать нечего.
              </Typography>
            ) : null}
          </Field>

          {serverError ? (
            <Typography as="p" className="text-red-600" role="alert" variant="bodySm">
              {serverError}
            </Typography>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Отмена
          </Button>
          <Button data-testid="question-save" disabled={pending} onClick={submit}>
            {pending ? 'Сохраняем…' : question ? 'Сохранить' : 'Добавить вопрос'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
