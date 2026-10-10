import { Notification03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Typography } from '@/components/typography'
import { formatDateTimeRu } from '../model'
import {
  notificationExcerpt,
  notificationHeadline,
  notificationTargetPath,
} from '../notifications-model'
import { useMarkThreadReadMutation, useNotificationsQuery } from '../queries'

/**
 * Колокольчик в шапке оболочки: непрочитанные комментарии из всех доступных
 * проектов. Клик по пункту отмечает тред прочитанным и ведёт к объекту.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const notificationsQuery = useNotificationsQuery()
  const markRead = useMarkThreadReadMutation()
  const items = notificationsQuery.data?.items ?? []

  const openItem = (item: (typeof items)[number]) => {
    markRead.mutate(
      { threadType: item.thread.threadType, threadId: item.thread.threadId },
      {
        onSuccess: () => {
          setOpen(false)
          void navigate({ to: notificationTargetPath(item.thread.route, item.project.id) })
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Уведомления${items.length > 0 ? ` — непрочитанных: ${items.length}` : ''}`}
          className="relative"
          data-testid="survey-bell"
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
          {items.length > 0 ? (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 [font-size:10px] tabular-nums"
              data-testid="survey-bell-count"
            >
              {items.length > 99 ? '99+' : items.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-4 py-3">
          <Typography as="p" variant="control">
            Уведомления
          </Typography>
          <Typography as="p" tone="muted" variant="caption">
            Непрочитанные комментарии в ваших проектах
          </Typography>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <Typography as="p" className="px-4 py-6" data-testid="survey-bell-empty" tone="muted" variant="bodySm">
              Непрочитанных нет — вы всё посмотрели.
            </Typography>
          ) : (
            <ul className="grid" data-testid="survey-bell-list">
              {items.map((item) => (
                <li className="border-b last:border-b-0" key={`${item.thread.threadType}-${item.thread.threadId}-${item.comment.id}`}>
                  <button
                    className="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-muted/50"
                    data-testid="notification-item"
                    onClick={() => openItem(item)}
                    type="button"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <Typography as="span" truncate variant="control">
                        {notificationHeadline(item)}
                      </Typography>
                      <Typography as="span" className="shrink-0" tone="muted" variant="caption">
                        {formatDateTimeRu(item.comment.createdAt)}
                      </Typography>
                    </span>
                    <Typography as="span" tone="muted" variant="caption">
                      {notificationExcerpt(item.comment.body)}
                    </Typography>
                    <Typography as="span" tone="muted" variant="caption">
                      {item.project.name}
                    </Typography>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
