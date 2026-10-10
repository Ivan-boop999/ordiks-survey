import type { ProjectSettings } from '@ordiks-survey/contracts'

import { computeFormulaValue } from '../../registries'
import { escapeHtml } from './sanitize'

/**
 * Автовставки отчёта: сервер собирает HTML-таблицы из данных проекта и дописывает их в конец
 * body раздела. Разметка повторяет кнопки прототипа (rsec.insfindings/insrequests/inscover/
 * insreg/inschart risks): h3-заголовок + table со строками th/td; текст экранируется.
 */

function cells(values: Array<string | number | null>): string {
  return values.map((value) => `<td>${escapeHtml(value === null || value === '' ? '—' : String(value))}</td>`).join('')
}

function headerCells(values: string[]): string {
  return values.map((value) => `<th>${escapeHtml(value)}</th>`).join('')
}

function row(values: Array<string | number | null>): string {
  return `<tr>${cells(values)}</tr>`
}

/// дд.мм.гггг — формат дат прототипа в таблицах отчёта.
export function formatDateRu(date: Date | null): string {
  if (!date) return '—'
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getUTCFullYear()}`
}

export type FindingInsertRow = {
  title: string
  priority: string
  status: string
}

export function findingsTableHtml(domainName: string, findings: FindingInsertRow[], settings: ProjectSettings): string {
  if (findings.length === 0) return ''
  const statusName = (id: string) => settings.findingStatuses.find((status) => status.id === id)?.name ?? id
  const rows = findings
    .map((finding) => row([finding.title, finding.priority, statusName(finding.status)]))
    .join('')
  return `<h3>Проблемы: ${escapeHtml(domainName)}</h3><table><tr>${headerCells(['Проблема', 'Приоритет', 'Статус'])}</tr>${rows}</table>`
}

export type RequestInsertRow = {
  what: string
  assigneeName: string | null
  deadline: Date | null
  overdue: boolean
  status: string
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  requested: 'запрошен',
  in_progress: 'в работе',
  received: 'получен',
}

export function requestsTableHtml(requests: RequestInsertRow[], now: Date): string {
  const open = requests
    .map((request) => ({
      ...request,
      overdue:
        request.overdue ||
        (request.status !== 'received' && request.deadline !== null && request.deadline.getTime() < now.getTime()),
    }))
    .filter((request) => request.status !== 'received')
  if (open.length === 0) return ''
  const rows = open
    .map((request) =>
      row([
        request.what,
        request.assigneeName,
        formatDateRu(request.deadline),
        request.overdue ? 'просрочен' : (REQUEST_STATUS_LABELS[request.status] ?? request.status),
      ]),
    )
    .join('')
  return `<h3>Открытые запросы к заказчику</h3><table><tr>${headerCells(['Запрос', 'Ответственный', 'Срок выполнения', 'Статус'])}</tr>${rows}</table>`
}

export type CoverageInsertRow = {
  groupName: string
  items: number
  done: number
  domainsTotal: number
  domainsClosed: number
}

export function coverageTableHtml(groups: CoverageInsertRow[]): string {
  const rows = groups
    .map((group) => {
      const percent = group.items > 0 ? Math.round((group.done / group.items) * 100) : 0
      return row([
        group.groupName,
        `${percent}% (${group.done}/${group.items})`,
        `${group.domainsClosed} из ${group.domainsTotal}`,
      ])
    })
    .join('')
  if (rows === '') return ''
  return `<h3>Покрытие направлений обследования</h3><table><tr>${headerCells(['Группа', 'Пункты чек-листов', 'Направления закрыты'])}</tr>${rows}</table>`
}

export type RiskInsertRow = {
  title: string
  probability: number
  impact: number
  status: string
  ownerName: string | null
  mitigation: string
}

const RISK_STATUS_LABELS: Record<string, string> = {
  open: 'открыт',
  mitigated: 'смягчён',
  closed: 'закрыт',
}

export function risksTableHtml(risks: RiskInsertRow[]): string {
  if (risks.length === 0) return ''
  const rows = risks
    .map((risk) =>
      row([
        risk.title,
        risk.probability,
        risk.impact,
        risk.probability * risk.impact,
        RISK_STATUS_LABELS[risk.status] ?? risk.status,
        risk.ownerName,
        risk.mitigation,
      ]),
    )
    .join('')
  return `<h3>Реестр рисков</h3><table><tr>${headerCells(['Риск', 'Вероятность', 'Влияние', 'Критичность', 'Статус', 'Ответственный', 'Мера'])}</tr>${rows}</table>`
}

export type RegistryInsertTree = {
  name: string
  fields: Array<{ key: string; name: string; type: string; options: string[]; formula: unknown }>
  statuses: Array<{ id: string; name: string }>
  entries: Array<{ statusId: string | null; values: Record<string, unknown> }>
}

export function registryTableHtml(registry: RegistryInsertTree): string {
  if (registry.entries.length === 0) return ''
  const statusName = (id: string | null) =>
    id === null ? '—' : (registry.statuses.find((status) => status.id === id)?.name ?? '—')
  const fields = registry.fields
  const header = `<tr>${headerCells(['#', ...fields.map((field) => field.name), 'Статус'])}</tr>`
  const rows = registry.entries
    .map((entry, index) => {
      const cellsHtml = fields.map((field) => {
        if (field.type === 'formula') {
          const value = computeFormulaValue(field.formula, registry.fields, entry.values)
          return `<td>${value === null ? '—' : escapeHtml(String(value))}</td>`
        }
        const raw = entry.values[field.key]
        return `<td>${escapeHtml(raw === undefined || raw === null || raw === '' ? '—' : String(raw))}</td>`
      })
      return `<tr><td>${index + 1}</td>${cellsHtml.join('')}<td>${escapeHtml(statusName(entry.statusId))}</td></tr>`
    })
    .join('')
  return `<h3>${escapeHtml(registry.name)}</h3><table>${header}${rows}</table>`
}
