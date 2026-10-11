import type { ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type ConfirmDeleteDialogProps = {
  /** Управление: родитель держит «что удаляем», диалог только спрашивает подтверждение. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Заголовок, обычно «Удалить X?». */
  title: ReactNode
  /** Пояснение последствий («Будут удалены N записей» и т.п.). */
  description?: ReactNode
  /** Текст подтверждающей кнопки. */
  confirmLabel?: string
  /** Кнопка подтверждения — деструктивная по умолчанию. */
  destructive?: boolean
  /** Вызывается по подтверждению; закрытие остаётся на вызывающем (onOpenChange(false)). */
  onConfirm: () => void
  pending?: boolean
}

/**
 * Единое подтверждение удалений по всему приложению (аудит: три разных паттерна —
 * window.confirm, мгновенное удаление и ничего). Обёртка над shadcn AlertDialog:
 * title/description/confirmLabel/destructive, деструктивная кнопка справа.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Удалить',
  destructive = true,
  onConfirm,
  pending = false,
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent data-testid="confirm-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-delete-confirm"
            disabled={pending}
            onClick={(event) => {
              // Не закрывать диалог самому: вызывающий закроет по onSuccess — иначе при
              // ошибке сервера подтверждение молча исчезнет.
              event.preventDefault()
              onConfirm()
            }}
            variant={destructive ? 'destructive' : 'default'}
          >
            {pending ? 'Удаляем…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
