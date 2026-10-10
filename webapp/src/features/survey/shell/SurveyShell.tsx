import { BoxesIcon, Logout01Icon, MoreIcon, MoreVerticalCircle01Icon, Notification03Icon, UserCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { UserDto } from '@ordiks-survey/contracts'
import { useState, type ComponentPropsWithoutRef, type PropsWithChildren } from 'react'


import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Typography } from '@/components/typography'
import {
  ORG_ROLE_LABELS,
  sectionPath,
  sectionsForViewRole,
  SURVEY_SECTION_GROUPS,
  type SurveySection,
  type SurveyViewRole,
} from '../model'

/** Ссылка навигации опроса: закрывает мобильный сайдбар после клика. */
export function SurveyLink({
  onClick,
  to,
  ...props
}: Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { to: string }) {
  const { setOpenMobile } = useSidebar()
  return (
    <Link
      {...props}
      activeOptions={{ exact: true }}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpenMobile(false)
      }}
      to={to}
    />
  )
}

function getSidebarDefaultOpen() {
  const persistedState = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('sidebar_state='))
    ?.slice('sidebar_state='.length)
  return persistedState !== 'false'
}

/**
 * Оболочка приложения обследования: сайдбар с разделами проекта (ПК), шапка с переключателем
 * проекта и колокольчиком (заглушка до волны уведомлений), нижняя навигация из 5 главных
 * разделов + «Ещё» (мобильные, как в прототипе).
 */
export function SurveyShell({
  children,
  onLogout,
  projectId,
  section,
  user,
  viewRole,
  projects,
  projectLabel,
}: PropsWithChildren<{
  onLogout: () => Promise<void>
  projectId: string | null
  section: SurveySection | null
  user: UserDto
  viewRole: SurveyViewRole
  projects: ReadonlyArray<{ id: string; name: string }>
  projectLabel: string
}>) {
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const sections = sectionsForViewRole(viewRole)
  const mobileSections = sections.filter((item) => item.mobile)
  const activeDef = section ? sections.find((item) => item.id === section) : null
  const title = projectId ? (activeDef?.label ?? 'Раздел') : 'Проекты'

  const switchProject = (nextId: string) => {
    if (!projectId || !section) {
      void navigate({ to: sectionPath(nextId, 'dashboard') })
      return
    }
    void navigate({ to: sectionPath(nextId, section) })
  }

  return (
    <SidebarProvider defaultOpen={getSidebarDefaultOpen()}>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="ОРДИКС Обследование">
                <SurveyLink to={projectId ? sectionPath(projectId, 'dashboard') : '/survey/projects'}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                    <Typography as="span" variant="control">О</Typography>
                  </span>
                  <span className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
                    <Typography variant="control" truncate>
                      ОРДИКС Обследование
                    </Typography>
                    <Typography variant="caption" tone="muted" truncate>
                      Предпроектное обследование
                    </Typography>
                  </span>
                </SurveyLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Разделы обследования" data-testid="survey-navigation">
            {SURVEY_SECTION_GROUPS.map((group) => {
              const items = group.items.filter(
                (item) => !(item.teamOnly && viewRole !== 'team'),
              )
              if (!items.length) return null
              return (
                <SidebarGroup key={group.title}>
                  <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.title === 'Общее' ? (
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            asChild
                            isActive={projectId === null}
                            tooltip="Проекты"
                          >
                            <SurveyLink data-testid="survey-nav-projects" to="/survey/projects">
                              <HugeiconsIcon icon={BoxesIcon} strokeWidth={2} />
                              <Typography asChild variant="control">
                                <span>Проекты</span>
                              </Typography>
                            </SurveyLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ) : null}
                      {projectId === null
                        ? group.title === 'Обследование'
                          ? (
                              <SidebarMenuItem>
                                <Typography
                                  as="span"
                                  className="px-3 py-1"
                                  tone="muted"
                                  variant="caption"
                                >
                                  Выберите проект, чтобы увидеть разделы обследования.
                                </Typography>
                              </SidebarMenuItem>
                            )
                          : null
                        : items.map((item) => (
                            <SidebarMenuItem key={item.id}>
                              <SidebarMenuButton
                                asChild
                                isActive={section === item.id}
                                tooltip={item.label}
                              >
                                <SurveyLink
                                  data-testid={`survey-nav-${item.id}`}
                                  to={sectionPath(projectId, item.id)}
                                >
                                  <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                                  <Typography asChild variant="control">
                                    <span>{item.label}</span>
                                  </Typography>
                                </SurveyLink>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )
            })}
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <SurveyNavUser onLogout={onLogout} user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center border-b bg-background/95 backdrop-blur">
          <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator
              className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              orientation="vertical"
            />
            <div className="flex min-w-0 items-center gap-2">
              <Typography as="span" variant="h6" className="truncate">
                {title}
              </Typography>
              {projectId && projectLabel ? (
                <Typography
                  as="span"
                  variant="caption"
                  tone="muted"
                  className="hidden truncate sm:inline"
                >
                  · {projectLabel}
                </Typography>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {projectId && projects.length > 1 ? (
                <Select onValueChange={switchProject} value={projectId}>
                  <SelectTrigger
                    aria-label="Активный проект"
                    className="h-9 w-[150px] sm:w-[220px]"
                    size="sm"
                  >
                    <SelectValue placeholder="Проект" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button
                aria-label="Уведомления"
                className="relative"
                data-testid="survey-bell"
                onClick={() => undefined}
                size="icon-sm"
                title="Уведомления — наполнение в следующей волне"
                variant="ghost"
              >
                <HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
              </Button>
            </div>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">{children}</div>
        {projectId ? (
          <nav
            aria-label="Основные разделы"
            className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            data-testid="survey-bottom-nav"
          >
            {mobileSections.map((item) => (
              <SurveyLink
                className={`flex flex-1 flex-col items-center gap-1 py-2 ${
                  section === item.id ? 'text-primary' : 'text-muted-foreground'
                }`}
                key={item.id}
                to={sectionPath(projectId, item.id)}
              >
                <HugeiconsIcon icon={item.icon} size={20} strokeWidth={2} />
                <Typography as="span" variant="caption" wrap="nowrap">
                  {item.mobileLabel ?? item.label}
                </Typography>
              </SurveyLink>
            ))}
            <button
              aria-label="Ещё разделы"
              className="flex flex-1 flex-col items-center gap-1 py-2 text-muted-foreground"
              onClick={() => setMoreOpen(true)}
              type="button"
            >
              <HugeiconsIcon icon={MoreIcon} size={20} strokeWidth={2} />
              <Typography as="span" tone="muted" variant="caption" wrap="nowrap">
                Ещё
              </Typography>
            </button>
          </nav>
        ) : null}
        <Sheet onOpenChange={setMoreOpen} open={moreOpen}>
          <SheetContent className="pb-[env(safe-area-inset-bottom)]" side="bottom">
            <SheetHeader>
              <SheetTitle>Все разделы</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 pb-4">
              {projectId
                ? sections.map((item) => (
                    <SurveyLink
                      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center"
                      data-testid={`survey-more-${item.id}`}
                      key={item.id}
                      onClick={() => setMoreOpen(false)}
                      to={sectionPath(projectId, item.id)}
                    >
                      <HugeiconsIcon icon={item.icon} size={20} strokeWidth={2} />
                      <Typography as="span" align="center" variant="caption">
                        {item.label}
                      </Typography>
                    </SurveyLink>
                  ))
                : null}
              <SurveyLink
                className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center"
                onClick={() => setMoreOpen(false)}
                to="/survey/projects"
              >
                <HugeiconsIcon icon={BoxesIcon} size={20} strokeWidth={2} />
                <Typography as="span" align="center" variant="caption">
                  Проекты
                </Typography>
              </SurveyLink>
            </div>
          </SheetContent>
        </Sheet>
      </SidebarInset>
    </SidebarProvider>
  )
}

function SurveyNavUser({ onLogout, user }: { onLogout: () => Promise<void>; user: UserDto }) {
  const { isMobile, setOpen } = useSidebar()
  const [logoutError, setLogoutError] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)

  const logout = async () => {
    setLogoutError(false)
    setLogoutPending(true)
    try {
      await onLogout()
    } catch {
      setLogoutError(true)
      setOpen(true)
    } finally {
      setLogoutPending(false)
    }
  }

  const initials = (user.displayName ?? user.email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <>
      {logoutError ? (
        <Typography data-testid="logout-error" role="alert" variant="caption" tone="destructive">
          Не удалось выйти. Попробуйте ещё раз.
        </Typography>
      ) : null}
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                aria-label="Меню аккаунта"
                data-testid="account-menu"
                size="lg"
                tooltip={user.displayName ?? user.email}
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                  <Typography variant="control" truncate>
                    {user.displayName ?? user.email}
                  </Typography>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Typography
                      data-testid="current-user-email"
                      variant="caption"
                      tone="muted"
                      truncate
                    >
                      {user.email}
                    </Typography>
                    <Badge className="shrink-0" variant="outline">
                      {ORG_ROLE_LABELS[user.orgRole]}
                    </Badge>
                  </div>
                </div>
                <HugeiconsIcon
                  className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
                  icon={MoreVerticalCircle01Icon}
                  strokeWidth={2}
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56 rounded-lg"
              side={isMobile ? 'bottom' : 'right'}
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0">
                <div className="flex items-center gap-2 px-1 py-1.5">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <Typography variant="bodySmMedium" truncate>
                      {user.displayName ?? user.email}
                    </Typography>
                    <Typography variant="caption" tone="muted" truncate>
                      {ORG_ROLE_LABELS[user.orgRole]} · {user.email}
                    </Typography>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <SurveyLink to="/app/profile">
                  <HugeiconsIcon icon={UserCircle02Icon} strokeWidth={2} />
                  Профиль
                </SurveyLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <SurveyLink to="/app/settings">
                  <HugeiconsIcon icon={MoreIcon} strokeWidth={2} />
                  Настройки вида
                </SurveyLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="account-menu-logout"
                disabled={logoutPending}
                onSelect={() => void logout()}
                variant="destructive"
              >
                <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
                {logoutPending ? 'Выходим…' : 'Выйти'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}

