import type { ReportReadiness, ReportSectionDto } from '@ordiks-survey/contracts'

// ============================================================
// Отчёт: чистая логика виз и готовности — экран и тесты считают
// сводку одинаково (раздел согласован, если есть виза ok от клиента
// и нет виз с замечаниями — зеркало серверной ReportReadiness).
// ============================================================

export type ApprovalSummary = {
  sections: number
  agreed: number
  withIssues: number
}

/** Сводка «согласовано N из M»: по разделам с учётом замечаний (замечание бьёт согласование). */
export function approvalSummary(sections: readonly ReportSectionDto[]): ApprovalSummary {
  let agreed = 0
  let withIssues = 0
  for (const section of sections) {
    // Виза на пользователя одна (повторная перезаписывается) — берём последнюю по пользователю.
    const byUser = new Map<string, 'approved' | 'changes'>()
    for (const approval of section.approvals) byUser.set(approval.userId, approval.decision)
    const decisions = new Set(byUser.values())
    if (decisions.has('changes')) withIssues += 1
    else if (decisions.has('approved')) agreed += 1
  }
  return { sections: sections.length, agreed, withIssues }
}

/** Сводка из готовности сервера (когда нет полных секций — например, в шапке). */
export function readinessSummary(readiness: ReportReadiness | undefined): string {
  if (!readiness) return ''
  return `согласовано ${readiness.agreed} из ${readiness.sections}`
}

/** Тело запроса визы: решение + комментарий (прототип: виза с пояснением). */
export function approvalPayload(
  decision: 'approved' | 'changes',
  comment: string,
): { decision: 'approved' | 'changes'; comment: string } {
  return { decision, comment: comment.trim() }
}

/** Кнопки виз видят клиентские роли (client_lead/client_staff); наблюдателям сервер откажет. */
export function canApproveSections(viewRole: 'team' | 'client' | 'observer'): boolean {
  return viewRole === 'client'
}

/** Порядок id разделов после сдвига на index вверх/вниз (свап sortOrder на сервере). */
export function moveSectionIds(ids: string[], index: number, direction: -1 | 1): string[] {
  const target = ids[index]
  const neighbor = ids[index + direction]
  if (target === undefined || neighbor === undefined) return ids
  const next = ids.slice()
  next[index] = neighbor
  next[index + direction] = target
  return next
}
