import { Skeleton } from '@/components/ui/skeleton'

// ============================================================
// Скелетоны списков: живая загрузка вместо текста «Загружаем…»
// (аудит: Skeleton в ui есть, в survey не использовался вовсе).
// ============================================================

/** Строки списков (запросы, участники, приглашения). */
export function SurveyListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="grid gap-2" data-testid="survey-list-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton className="h-12 w-full rounded-lg" key={index} />
      ))}
    </div>
  )
}

/** Карточки (факты, гайды, проекты): превью + две строки текста. */
export function SurveyCardsSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      data-testid="survey-cards-skeleton"
    >
      {Array.from({ length: cards }, (_, index) => (
        <div className="overflow-hidden rounded-xl border" key={index}>
          <Skeleton className="h-32 w-full rounded-none" />
          <div className="grid gap-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Таблицы (интервью, находки): строка заголовка + строки. */
export function SurveyTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="grid gap-2" data-testid="survey-table-skeleton">
      <Skeleton className="h-9 w-full rounded-lg" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton className="h-11 w-full rounded-lg" key={index} />
      ))}
    </div>
  )
}

/** KPI-сетка дашборда. */
export function SurveyKpiSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-2 gap-4 xl:grid-cols-5"
      data-testid="survey-kpi-skeleton"
    >
      {Array.from({ length: cards }, (_, index) => (
        <div className="grid gap-2 rounded-xl border p-4" key={index}>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
