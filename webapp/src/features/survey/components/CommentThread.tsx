import { SentIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { CommentDto, ThreadType } from '@ordiks-survey/contracts'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { StatusChip, UserAvatar } from '@/components/survey'
import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  canWriteComments,
  commentRoleLabel,
} from '../comments-model'
import { displayNameOf, formatDateTimeRu } from '../model'
import {
  useCommentsQuery,
  useCreateCommentMutation,
  useMarkThreadReadMutation,
  useMembersQuery,
} from '../queries'
import { useSurveyProject } from '../use-survey-project'

/**
 * Обсуждение объекта проекта (факт, находка, интервью, запрос…): список комментариев
 * и форма ввода. Пишут все роли кроме наблюдателя; открытие треда гасит уведомление.
 */
export function CommentThread({
  projectId,
  threadId,
  threadType,
}: {
  projectId: string
  threadId: string
  threadType: ThreadType
}) {
  const { viewRole } = useSurveyProject()
  const commentsQuery = useCommentsQuery(projectId, threadType, threadId)
  const membersQuery = useMembersQuery(projectId)
  const createComment = useCreateCommentMutation(projectId)
  const { mutate: markThreadRead } = useMarkThreadReadMutation()
  const [body, setBody] = useState('')
  const [needsAnswer, setNeedsAnswer] = useState(false)
  const canWrite = canWriteComments(viewRole)
  const comments = commentsQuery.data?.items ?? []
  const members = membersQuery.data?.items ?? []

  // Открыли тред — считаем уведомления этого треда прочитанными (как колокольчик).
  useEffect(() => {
    if (commentsQuery.isSuccess) {
      markThreadRead({ threadType, threadId })
    }
  }, [commentsQuery.isSuccess, markThreadRead, threadId, threadType])

  const submit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    createComment.mutate(
      { threadType, threadId, body: trimmed, needsAnswer },
      {
        onSuccess: () => {
          setBody('')
          setNeedsAnswer(false)
          toast.success('Комментарий отправлен')
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  return (
    <section aria-label="Обсуждение" className="grid gap-2 border-t pt-3" data-testid="comment-thread">
      <Typography as="h4" tone="muted" variant="control">
        Обсуждение{comments.length > 0 ? ` · ${comments.length}` : ''}
      </Typography>

      {commentsQuery.isPending ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Загружаем комментарии…
        </Typography>
      ) : comments.length === 0 ? (
        <Typography as="p" tone="muted" variant="bodySm">
          Комментариев пока нет.
        </Typography>
      ) : (
        <div className="grid gap-2">
          {comments.map((comment) => (
            <CommentCard comment={comment} key={comment.id} roleLabel={commentRoleLabel(comment, members)} />
          ))}
        </div>
      )}

      {canWrite ? (
        <div className="grid gap-2">
          <Textarea
            data-testid="comment-input"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Комментарий…"
            rows={2}
            value={body}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={needsAnswer}
                data-testid="comment-needs-answer"
                onCheckedChange={(checked) => setNeedsAnswer(checked === true)}
              />
              <Typography as="span" tone="muted" variant="caption">
                ждёт ответа (SLA 48 ч)
              </Typography>
            </label>
            <Button
              data-testid="comment-submit"
              disabled={createComment.isPending || !body.trim()}
              onClick={submit}
              size="sm"
            >
              <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
              Отправить
            </Button>
          </div>
        </div>
      ) : (
        <Typography as="p" tone="muted" variant="caption">
          Наблюдатель читает обсуждение без права записи.
        </Typography>
      )}
    </section>
  )
}

/** Карточка комментария: аватар, автор, роль, время и чип «ждёт ответа». */
export function CommentCard({
  comment,
  roleLabel,
}: {
  comment: CommentDto
  roleLabel: string
}) {
  return (
    <article className="rounded-lg border bg-muted/30 p-3" data-comment-author={comment.authorEmail}>
      <div className="flex flex-wrap items-center gap-2">
        <UserAvatar email={comment.authorEmail} name={comment.authorName} />
        <Typography as="span" variant="control">
          {displayNameOf(comment.authorName, comment.authorEmail)}
        </Typography>
        <StatusChip color="gray">{roleLabel}</StatusChip>
        {comment.needsAnswer ? (
          <StatusChip color="amber">ждёт ответа</StatusChip>
        ) : null}
        <Typography as="span" className="ml-auto" tone="muted" variant="caption">
          {formatDateTimeRu(comment.createdAt)}
        </Typography>
      </div>
      <Typography as="p" className="mt-1.5 whitespace-pre-wrap" variant="bodySm">
        {comment.body}
      </Typography>
    </article>
  )
}
