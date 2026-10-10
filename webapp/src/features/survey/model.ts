import type {
  ChipColor,
  DomainStatus,
  FindingStatusItem,
  InterviewStatus,
  MemberRole,
  OrgRole,
  ProjectStatus,
  ProjectSummary,
  RequestStatus,
  StageStatus,
  TaskStatus } from '@ordiks-survey/contracts'

import {
  AlertCircleIcon,
  Camera01Icon,
  ChartLineIcon,
  CheckListIcon,
  DashboardCircleIcon,
  Doc01Icon,
  Grid02Icon,
  InboxIcon,
  KanbanIcon,
  Mic01Icon,
  MilestoneIcon,
  PassportIcon,
  Settings01Icon,
  WorkflowIcon,
} from '@hugeicons/core-free-icons'

// ============================================================
// Роли и доступ
// ============================================================

export const TEAM_ORG_ROLES: readonly OrgRole[] = ['owner', 'manager', 'analyst']

/** Команда ОРДИКС (глобальная роль) видит все проекты и раздел «Гайды»/«Настройки». */
export function isTeamOrgRole(orgRole: OrgRole): boolean {
  return TEAM_ORG_ROLES.includes(orgRole)
}

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Владелец',
  manager: 'РП',
  analyst: 'Аналитик',
  client: 'Заказчик',
}

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  manager: 'РП ОРДИКС',
  analyst: 'Аналитик',
  client_lead: 'Руководитель заказчика',
  client_staff: 'Сотрудник заказчика',
  observer: 'Наблюдатель',
}

/** Клиентские роли проекта: их контур — портал заказчика, без командных разделов. */
export const CLIENT_MEMBER_ROLES: readonly MemberRole[] = ['client_lead', 'client_staff', 'observer']

export function isClientMemberRole(role: MemberRole): boolean {
  return CLIENT_MEMBER_ROLES.includes(role)
}

/**
 * Уровень прав в проекте для UI: команда ОРДИКС — полная работа; client_lead/client_staff —
 * портал заказчика (просмотр + запросы); observer — только чтение. Сервер остаётся источником
 * истины (`item.access`), это лишь модель меню и кнопок.
 */
export type SurveyViewRole = 'team' | 'client' | 'observer'

export function viewRoleFor(orgRole: OrgRole, memberRole: MemberRole | null): SurveyViewRole {
  if (isTeamOrgRole(orgRole)) return 'team'
  if (memberRole === 'observer') return 'observer'
  return 'client'
}

// ============================================================
// Разделы проекта (меню оболочки)
// ============================================================

/** Ключ localStorage с последним выбранным проектом (для редиректа /survey). */
export const SURVEY_LAST_PROJECT_KEY = 'ordiks_survey_last_project'

export const SURVEY_SECTIONS = [
  'dashboard',
  'passport',
  'stages',
  'plan',
  'domains',
  'interviews',
  'guides',
  'facts',
  'requests',
  'findings',
  'processes',
  'analytics',
  'report',
  'settings',
] as const

export type SurveySection = (typeof SURVEY_SECTIONS)[number]

export function isSurveySection(value: string): value is SurveySection {
  return (SURVEY_SECTIONS as readonly string[]).includes(value)
}

type SectionDef = {
  id: SurveySection
  label: string
  icon: typeof DashboardCircleIcon
  /** Клиентские роли раздел не видят (Гайды, Настройки — команда ОРДИКС). */
  teamOnly?: boolean
  /** Один из пяти главных разделов нижней мобильной навигации. */
  mobile?: boolean
  /** В нижней навигации подпись короче. */
  mobileLabel?: string
}

export const SURVEY_SECTION_GROUPS: ReadonlyArray<{
  title: string
  items: ReadonlyArray<SectionDef>
}> = [
  {
    title: 'Обследование',
    items: [
      { id: 'dashboard', label: 'Дашборд', icon: DashboardCircleIcon, mobile: true, mobileLabel: 'Обзор' },
      { id: 'passport', label: 'Паспорт', icon: PassportIcon },
      { id: 'stages', label: 'Этапы', icon: MilestoneIcon },
      { id: 'plan', label: 'План', icon: KanbanIcon, mobile: true, mobileLabel: 'Задачи' },
      { id: 'domains', label: 'Домены', icon: Grid02Icon, mobile: true },
      { id: 'interviews', label: 'Интервью', icon: Mic01Icon },
      { id: 'guides', label: 'Гайды', icon: CheckListIcon, teamOnly: true },
      { id: 'facts', label: 'Факты', icon: Camera01Icon },
      { id: 'requests', label: 'Запросы', icon: InboxIcon, mobile: true },
      { id: 'findings', label: 'Находки', icon: AlertCircleIcon, mobile: true },
      { id: 'processes', label: 'Процессы', icon: WorkflowIcon },
      { id: 'analytics', label: 'Аналитика', icon: ChartLineIcon },
      { id: 'report', label: 'Отчёт', icon: Doc01Icon },
    ],
  },
  {
    title: 'Общее',
    items: [{ id: 'settings', label: 'Настройки', icon: Settings01Icon, teamOnly: true }],
  },
]

/** Плоский список разделов с метаданными (иконки — для шапки и заглушек). */
export const SURVEY_SECTION_ITEMS: ReadonlyArray<SectionDef> = SURVEY_SECTION_GROUPS.flatMap(
  (group) => group.items,
)

export function sectionDef(section: SurveySection) {
  const def = SURVEY_SECTION_ITEMS.find((item) => item.id === section)
  if (!def) throw new Error(`Unknown survey section: ${section}`)
  return def
}

/** Разделы, доступные роли: командные скрываются от клиентских ролей. */
export function sectionsForViewRole(role: SurveyViewRole): ReadonlyArray<SectionDef> {
  return SURVEY_SECTION_ITEMS.filter((item) => !(item.teamOnly && role !== 'team'))
}

export function sectionPath(projectId: string, section: SurveySection): string {
  return `/survey/p/${projectId}/${section}`
}

export function isSectionAllowed(role: SurveyViewRole, section: SurveySection): boolean {
  const def = sectionDef(section)
  return !(def.teamOnly && role !== 'team')
}

// ============================================================
// Статусы → чипы
// ============================================================

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; color: ChipColor }> = {
  active: { label: 'Активен', color: 'green' },
  archived: { label: 'Архив', color: 'gray' },
}

export const STAGE_STATUS_META: Record<StageStatus, { label: string; color: ChipColor }> = {
  planned: { label: 'Запланирован', color: 'gray' },
  active: { label: 'Идёт', color: 'blue' },
  done: { label: 'Завершён', color: 'green' },
}

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: ChipColor }> = {
  todo: { label: 'К выполнению', color: 'gray' },
  doing: { label: 'В работе', color: 'blue' },
  done: { label: 'Готово', color: 'green' },
  cancelled: { label: 'Отменена', color: 'red' },
}

/** Порядок колонок канбана плана задач. */
export const TASK_COLUMNS: readonly TaskStatus[] = ['todo', 'doing', 'done', 'cancelled']

export const DOMAIN_STATUS_META: Record<DomainStatus, { label: string; color: ChipColor }> = {
  not_started: { label: 'Не начат', color: 'gray' },
  in_progress: { label: 'В работе', color: 'amber' },
  closed: { label: 'Закрыт', color: 'green' },
}

export const INTERVIEW_STATUS_META: Record<InterviewStatus, { label: string; color: ChipColor }> = {
  planned: { label: 'Запланировано', color: 'blue' },
  done: { label: 'Проведено', color: 'amber' },
  formatted: { label: 'Оформлено', color: 'green' },
}

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; color: ChipColor }> = {
  requested: { label: 'Ожидаем', color: 'amber' },
  in_progress: { label: 'В работе', color: 'blue' },
  received: { label: 'Получено', color: 'green' },
}

/** Цвет чипа статуса находки из справочника проекта; дефолт — как в прототипе. */
export function findingStatusMeta(
  status: string,
  statuses: readonly FindingStatusItem[],
): { label: string; color: ChipColor } {
  const found = statuses.find((item) => item.id === status || item.name === status)
  if (found) return { label: found.name, color: found.color }
  return { label: status, color: 'gray' }
}

const PRIORITY_META: Record<string, { label: string; color: ChipColor }> = {
  'Критично': { label: 'Критично', color: 'red' },
  'Высокий': { label: 'Высокий', color: 'amber' },
  'Средний': { label: 'Средний', color: 'blue' },
  'Низкий': { label: 'Низкий', color: 'gray' },
}

export function priorityMeta(priority: string): { label: string; color: ChipColor } {
  return PRIORITY_META[priority] ?? { label: priority, color: 'gray' }
}

/** Ранг приоритета для сортировки находок (меньше — важнее). */
export const PRIORITY_RANK: Record<string, number> = {
  'Критично': 0,
  'Высокий': 1,
  'Средний': 2,
  'Низкий': 3,
}

// ============================================================
// Даты (ru) и мелкие форматтеры
// ============================================================

const ruDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
const ruDateShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const ruDateTime = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateRu(value: Date | string | null | undefined, short = false): string {
  const date = toDate(value)
  if (!date) return '—'
  return (short ? ruDateShort : ruDate).format(date)
}

export function formatDateTimeRu(value: Date | string | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return ruDateTime.format(date)
}

/** Значение для `<input type="date">` (YYYY-MM-DD) или null. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Целых дней от сегодня до даты (в будущее — положительные). */
export function daysUntil(value: Date | string | null | undefined): number | null {
  const date = toDate(value)
  if (!date) return null
  const today = new Date()
  const startOfToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfTarget = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfTarget - startOfToday) / DAY_MS)
}

export function isOverdue(value: Date | string | null | undefined): boolean {
  const days = daysUntil(value)
  return days !== null && days < 0
}

export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

/** Дни до даты словами: «5 дней», «просрочено на 3 дня». */
export function daysUntilLabel(value: Date | string | null | undefined): string {
  const days = daysUntil(value)
  if (days === null) return '—'
  if (days === 0) return 'сегодня'
  if (days > 0) return `${days} ${pluralRu(days, 'день', 'дня', 'дней')}`
  return `просрочено на ${-days} ${pluralRu(-days, 'день', 'дня', 'дней')}`
}

/** Инициалы для аватара («Иван Заболотный» → «ИЗ»). */
export function initialsOf(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
  return letters || fallback
}

/** Отображаемое имя участника: имя либо локальная часть email. */
export function displayNameOf(name: string | null | undefined, email?: string | null): string {
  if (name && name.trim()) return name
  if (email) return email.split('@')[0] ?? email
  return '—'
}

// ============================================================
// Прогресс доменов и проектов
// ============================================================

export type ChecklistProgress = { done: number; total: number }

/** Сколько процентов составляет done/max (0 при пустом знаменателе). */
export function percent(done: number, max: number) {
  return max > 0 ? Math.round((done / max) * 100) : 0
}

/** Прогресс чек-листа домена: сколько пунктов отмечено. */
export function checklistProgress(items: ReadonlyArray<{ done: boolean }>): ChecklistProgress {
  return { done: items.filter((item) => item.done).length, total: items.length }
}

/**
 * Активный проект по умолчанию: последний выбранный (localStorage), иначе первый активный.
 * Архивный проект выбирается вручную — сам он дефолтом не становится.
 */
export function defaultProjectId(
  projects: readonly ProjectSummary[],
  lastUsedId: string | null,
): string | null {
  if (lastUsedId) {
    const lastUsed = projects.find((project) => project.id === lastUsedId)
    if (lastUsed && lastUsed.status === 'active') return lastUsed.id
  }
  return projects.find((project) => project.status === 'active')?.id ?? projects[0]?.id ?? null
}

/** Цвета чипа приоритета находки (как в прототипе). */
export const PRIORITY_COLORS: Record<string, ChipColor> = {
  Критично: 'red',
  Высокий: 'amber',
  Средний: 'blue',
  Низкий: 'gray',
}
