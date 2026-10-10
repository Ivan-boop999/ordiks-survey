import type { DomainStatus } from '@ordiks-survey/contracts'

/**
 * Статус домена по чек-листу (по образцу прототипа, Changes['domain.check']):
 * все пункты выполнены → closed; любой выполнен → in_progress; ни один — статус не понижается,
 * чтобы ручная установка (форма домена) переживала правки чек-листа.
 */
export function nextDomainStatus(
  current: DomainStatus,
  items: readonly { done: boolean }[],
): DomainStatus {
  if (items.length > 0 && items.every((item) => item.done)) return 'closed'
  if (items.some((item) => item.done)) return 'in_progress'
  return current
}
