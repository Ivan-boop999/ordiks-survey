import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Typography } from '@/components/typography'
import { sectionPath, type SurveySection } from '../model'
import { surveyQueryKeys } from '../queries'

type SearchItem = {
  id: string
  group: 'Задачи' | 'Находки' | 'Факты' | 'Интервью' | 'Гайды' | 'Реестры'
  title: string
  section: SurveySection
  /** Открыть объект по ?focus= (диалог/тред на странице раздела). */
  focus: boolean
}

/**
 * Глобальный поиск Ctrl+K/Cmd+K: задачи, находки, факты, интервью, гайды и свои реестры
 * текущего проекта. Данные читаются из кэша react-query (страницы уже грузили их),
 * сеть не трогается; результат ведёт в раздел (для объектов — с ?focus=id).
 */
export function GlobalSearch({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Снимок кэша на момент открытия: без сети, без подписок на каждое нажатие клавиши.
  const items = useMemo<SearchItem[]>(() => {
    if (!open) return []
    const cached = <T,>(key: readonly unknown[]): readonly T[] =>
      queryClient.getQueryData<{ items: readonly T[] }>(key as readonly unknown[])?.items ?? []

    const tasks = cached<{ id: string; title: string }>(surveyQueryKeys.tasks(projectId))
    const findings = cached<{ id: string; title: string }>(surveyQueryKeys.findings(projectId))
    const facts = cached<{ id: string; title: string }>([
      ...surveyQueryKeys.project(projectId),
      'facts',
    ])
    const interviews = cached<{ id: string; respondent: string }>(
      surveyQueryKeys.interviews(projectId),
    )
    const guides = cached<{ id: string; name: string }>(surveyQueryKeys.guides(projectId))
    const registries = cached<{ id: string; name: string }>(surveyQueryKeys.registries(projectId))

    return [
      ...tasks.map<SearchItem>((task) => ({
        id: task.id,
        group: 'Задачи',
        title: task.title,
        section: 'plan',
        focus: false,
      })),
      ...findings.map<SearchItem>((finding) => ({
        id: finding.id,
        group: 'Находки',
        title: finding.title,
        section: 'findings',
        focus: true,
      })),
      ...facts.map<SearchItem>((fact) => ({
        id: fact.id,
        group: 'Факты',
        title: fact.title,
        section: 'facts',
        focus: true,
      })),
      ...interviews.map<SearchItem>((interview) => ({
        id: interview.id,
        group: 'Интервью',
        title: interview.respondent,
        section: 'interviews',
        focus: true,
      })),
      ...guides.map<SearchItem>((guide) => ({
        id: guide.id,
        group: 'Гайды',
        title: guide.name,
        section: 'guides',
        focus: false,
      })),
      ...registries.map<SearchItem>((registry) => ({
        id: registry.id,
        group: 'Реестры',
        title: registry.name,
        section: 'registries',
        focus: false,
      })),
    ]
  }, [open, projectId, queryClient])

  const go = (item: SearchItem) => {
    setOpen(false)
    const base = sectionPath(projectId, item.section)
    void navigate({ to: item.focus ? `${base}?focus=${encodeURIComponent(item.id)}` : base })
  }

  const groups = [...new Set(items.map((item) => item.group))]

  return (
    <>
      <Button
        aria-label="Поиск (Ctrl+K)"
        className="gap-1.5 px-2 text-muted-foreground"
        data-testid="global-search-open"
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={2} />
        <Typography as="span" className="hidden sm:inline" variant="control">
          Поиск
        </Typography>
        <Typography
          as="span"
          className="ml-1 hidden rounded border px-1 sm:inline"
          variant="controlXs"
        >
          Ctrl K
        </Typography>
      </Button>
      <CommandDialog
        description="Поиск по разделам текущего проекта"
        onOpenChange={setOpen}
        open={open}
        title="Поиск"
      >
        <CommandInput placeholder="Задачи, находки, факты, интервью, гайды, реестры…" />
        <CommandList>
          <CommandEmpty>Ничего не найдено.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <CommandItem
                    key={`${item.group}-${item.id}`}
                    onSelect={() => go(item)}
                    value={`${item.group} ${item.title}`}
                  >
                    {item.title}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
