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

// ============================================================
// Автовставки: маркер заголовка вставленного блока (сервер
// начинает каждый фрагмент с <h3>…</h3>) — для защиты от дублей.
// ============================================================

/** Заголовок, которым сервер начинает вставленный фрагмент (без экранирования имён). */
export function insertHeading(kind: string, ctx: { domainName?: string; registryName?: string }): string {
  switch (kind) {
    case 'findings':
      return `Проблемы: ${ctx.domainName ?? ''}`
    case 'requests':
      return 'Открытые запросы к заказчику'
    case 'coverage':
      return 'Покрытие направлений обследования'
    case 'risks':
      return 'Реестр рисков'
    case 'registry':
      return ctx.registryName ?? ''
    default:
      return ''
  }
}

/** Есть ли в теле раздела уже такая вставка (по заголовку фрагмента). */
export function hasInsertFragment(
  body: string,
  kind: string,
  ctx: { domainName?: string; registryName?: string },
): boolean {
  const heading = insertHeading(kind, ctx)
  if (!heading) return false
  return body.includes(escapeHtmlText(heading))
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// ============================================================
// Панель форматирования: обёртки выделения и генерация вставок
// для textarea-редактора HTML тела раздела.
// ============================================================

/** Результат трансформации текста тулбаром: новый текст + диапазон выделения в нём. */
export type TextTransform = { text: string; selectionStart: number; selectionEnd: number }

/** Обернуть выделение парой тегов (пустое выделение оставляет курсор между тегами). */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
): TextTransform {
  const selected = text.slice(start, end)
  const next = `${text.slice(0, start)}${before}${selected}${after}${text.slice(end)}`
  const anchor = start + before.length
  return { text: next, selectionStart: anchor, selectionEnd: anchor + selected.length }
}

/** Превратить выделенные строки в список ul/ol. */
export function wrapLinesList(
  text: string,
  start: number,
  end: number,
  tag: 'ul' | 'ol',
): TextTransform {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const rawEnd = text.indexOf('\n', end)
  const lineEnd = rawEnd === -1 ? text.length : rawEnd
  const block = text.slice(lineStart, lineEnd) || 'Пункт'
  const items = block
    .split('\n')
    .map((line) => `<li>${line}</li>`)
    .join('')
  const next = `${text.slice(0, lineStart)}<${tag}>${items}</${tag}>${text.slice(lineEnd)}`
  const anchor = lineStart + `<${tag}>`.length
  return { text: next, selectionStart: anchor, selectionEnd: anchor + items.length }
}

/** HTML простой таблицы rows×cols с шапкой. */
export function tableHtml(rows: number, cols: number): string {
  const safeRows = Math.min(Math.max(rows || 2, 1), 20)
  const safeCols = Math.min(Math.max(cols || 2, 1), 10)
  const head = `<tr>${Array.from({ length: safeCols }, (_, i) => `<th>Колонка ${i + 1}</th>`).join('')}</tr>`
  const body = Array.from(
    { length: safeRows },
    () => `<tr>${Array.from({ length: safeCols }, () => '<td></td>').join('')}</tr>`,
  ).join('')
  return `<table>${head}${body}</table>`
}

// ============================================================
// Экспорт отчёта в Word (.doc): HTML-as-doc, Word открывает
// разметку и таблицы напрямую (клиентский экспорт без backend).
// ============================================================

export type WordExportSection = { title: string; body: string }

export type WordExportMeta = {
  projectName: string
  client: string
  dateLabel: string
  members: ReadonlyArray<{ name: string; roleLabel: string }>
}

/** Полный HTML отчёта для Blob-а .doc: титул + разделы с инлайн-стилями. */
export function buildReportWordHtml(meta: WordExportMeta, sections: readonly WordExportSection[]): string {
  const team = meta.members.map((member) => `<li>${member.name} — ${member.roleLabel}</li>`).join('')
  const body = sections
    .map((section, index) => `<h2>${index + 1}. ${section.title}</h2>${section.body || '<p>—</p>'}`)
    .join('\n<section><hr></section>\n')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtmlText(meta.projectName)} — отчёт</title>
<style>
body { font-family: Calibri, Arial, sans-serif; }
h1, h2, h3 { color: #1f2937; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #9ca3af; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #e5e7eb; }
</style></head>
<body>
<h1>${escapeHtmlText(meta.projectName)}</h1>
<p><b>Отчёт по предпроектному обследованию</b></p>
<p>Заказчик: ${escapeHtmlText(meta.client || '—')}<br>Дата: ${escapeHtmlText(meta.dateLabel)}</p>
<p>Команда обследования:</p><ul>${team}</ul>
<hr>
${body}
</body></html>`
}

/** Скачивание Blob как файла (общее для Word/JSON-экспортов). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
