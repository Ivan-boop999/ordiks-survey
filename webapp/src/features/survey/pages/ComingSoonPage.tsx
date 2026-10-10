import { HugeiconsIcon } from '@hugeicons/react'

import { PageContainer } from '@/components/PageLayout'
import { Typography } from '@/components/typography'
import { SectionCard } from '@/components/survey'
import { sectionDef, type SurveySection } from '../model'

/** Заглушки разделов, которые наполняются в следующих волнах (F2/F3). */
const SECTION_TEASERS: Partial<Record<SurveySection, { soon: string; items: string[] }>> = {
  interviews: {
    soon: 'Календарь интервью, конспекты и ответы по гайдам — волна F2.',
    items: ['Календарь и список интервью', 'Заполнение ответов по опроснику', 'Конспект и заметки'],
  },
  guides: {
    soon: 'Конструктор опросников с условными вопросами — волна F2.',
    items: [
      'Секции и вопросы (текст/да-нет/шкала/варианты)',
      'Условный показ вопросов',
      'Дублирование гайдов',
    ],
  },
  facts: {
    soon: 'Реестр фактов с фото, файлами и заметками — волна F2.',
    items: ['Фото-факты со сжатием', 'Файлы-доказательства', 'Фильтр по доменам и цехам'],
  },
  requests: {
    soon: 'Полный реестр запросов данных к заказчику — волна F2. На дашборде уже видны «Ждём от вас» и смена статуса.',
    items: ['Создание и редактирование запросов', 'Просрочки и напоминания', 'История получения'],
  },
  findings: {
    soon: 'Реестр находок с приоритетами и статусами проекта — волна F2.',
    items: ['Создание находок из фактов', 'Массовая смена статуса', 'Фильтры и владельцы'],
  },
  processes: {
    soon: 'Процессы AS-IS / TO-BE со схемами — волна F3.',
    items: ['Цепочки шагов', 'Загрузка схем (png/svg)', 'Сравнение AS-IS и TO-BE'],
  },
  analytics: {
    soon: 'Аналитика обследования — волна F3.',
    items: ['Реестр рисков', 'Разрывы (GAP) и решения', 'Требования к целевой системе'],
  },
  report: {
    soon: 'Сборка отчёта и согласование разделов заказчиком — волна F3.',
    items: ['Разделы отчёта', 'Визы заказчиков', 'Экспорт на печать'],
  },
  settings: {
    soon: 'Настройки проекта: участники и роли, справочники статусов — волна F2. Справочники уже видны в паспорте проекта.',
    items: ['Управление участниками', 'Приглашения в проект', 'Архивация проекта'],
  },
}

/** Страница-заглушка «скоро» для разделов следующих волн. */
export function ComingSoonPage({ section }: { section: SurveySection }) {
  const def = sectionDef(section)
  const teaser = SECTION_TEASERS[section]
  return (
    <PageContainer>
      <div className="flex flex-col items-center gap-3 pt-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
          <HugeiconsIcon icon={def.icon} size={26} strokeWidth={2} />
        </span>
        <Typography as="h1" variant="h3">
          {def.label}
        </Typography>
        <Typography
          as="p"
          className="max-w-md"
          data-testid="coming-soon-text"
          tone="muted"
          variant="bodySm"
        >
          {teaser?.soon ?? 'Раздел наполняется в следующей волне разработки.'}
        </Typography>
      </div>
      {teaser ? (
        <SectionCard className="mt-6 max-w-xl justify-self-center" title="Что появится">
          <ul className="grid gap-2">
            {teaser.items.map((item) => (
              <li className="flex items-start gap-2" key={item}>
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <Typography as="span" tone="muted" variant="bodySm">
                  {item}
                </Typography>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </PageContainer>
  )
}
