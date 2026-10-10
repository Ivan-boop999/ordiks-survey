import { Typography } from '@/components/typography'

// ============================================================
// Печать отчёта: чистые A4-страницы без оболочки приложения.
// CSS вставляется <style>-тегом на странице отчёта (создаётся при
// монтировании), титул — отдельный компонент для тестов разметки.
// ============================================================

/**
 * Print-stylesheet: скрывает всё, кроме корня отчёта (классический трюк с
 * visibility — работает без знания структуры оболочки), разбивает разделы
 * по страницам A4. Класс report-print-root вешается на контейнер отчёта,
 * report-print-page — на «лист» (титул и каждый раздел).
 */
export const REPORT_PRINT_CSS = `
.report-body table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.report-body th, .report-body td { border: 1px solid var(--border, #d4d4d8); padding: 4px 8px; text-align: left; vertical-align: top; }
.report-body th { background: var(--muted, #f4f4f5); font-weight: 600; }
.report-body ul, .report-body ol { padding-left: 1.25rem; list-style: revert; }
.report-body h1, .report-body h2, .report-body h3 { font-weight: 600; margin: 0.75em 0 0.25em; }
.report-body p { margin: 0.4em 0; }
@page { size: A4; margin: 20mm; }
@media print {
  body { background: #fff !important; }
  body * { visibility: hidden; }
  .report-print-root, .report-print-root * { visibility: visible; }
  .report-print-root {
    position: absolute;
    inset: 0;
    width: 100%;
    padding: 0;
    margin: 0;
  }
  .report-print-page {
    break-after: page;
    page-break-after: always;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
  }
  .report-print-page:last-child { break-after: auto; page-break-after: auto; }
  .report-print-hidden { display: none !important; }
}
`

/** Титульный лист отчёта: проект, дата, команда. Печатается первым «листом». */
export function ReportTitlePage({
  client,
  dateLabel,
  members,
  projectName,
}: {
  client: string
  dateLabel: string
  members: ReadonlyArray<{ name: string; roleLabel: string }>
  projectName: string
}) {
  return (
    <section className="report-print-page" data-testid="report-print-title">
      <div className="flex min-h-[200mm] flex-col items-center justify-center gap-8 py-16 text-center">
        <div className="grid gap-3">
          <Typography as="p" tone="muted" variant="caption">
            Отчёт по предпроектному обследованию
          </Typography>
          <Typography as="h1" variant="h1">
            {projectName}
          </Typography>
          {client ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Заказчик: {client}
            </Typography>
          ) : null}
        </div>
        <div className="grid gap-1">
          <Typography as="p" tone="muted" variant="bodySm">
            Дата: {dateLabel}
          </Typography>
        </div>
        <div className="grid w-full max-w-sm gap-2">
          <Typography as="p" tone="muted" variant="caption">
            Команда обследования
          </Typography>
          <ul className="grid justify-items-center gap-1">
            {members.map((member) => (
              <li key={`${member.name}-${member.roleLabel}`}>
                <Typography as="span" variant="bodySm">
                  {member.name} · {member.roleLabel}
                </Typography>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
