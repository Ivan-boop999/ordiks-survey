import { useLocation, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { focusIdFromSearch } from './notifications-model'

/**
 * Переход из уведомления к объекту: читает ?focus=<id>, ждёт загрузки списка раздела,
 * открывает объект колбэком и убирает параметр из URL (чтобы закрытие диалога не
 * «переоткрывало» его). Список undefined = запрос ещё в полёте — фокус не сгорает.
 */
export function useFocusTarget<T extends { id: string }>(
  items: readonly T[] | undefined,
  onFound: (item: T) => void,
) {
  const location = useLocation()
  const router = useRouter()
  const focusId = focusIdFromSearch(location.searchStr)

  useEffect(() => {
    if (!focusId || items === undefined) return
    router.history.replace(location.pathname)
    const target = items.find((item) => item.id === focusId)
    if (target) onFound(target)
    // Одноразовое срабатывание: URL уже очищен, onFound менять не для чего.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, items])
}
