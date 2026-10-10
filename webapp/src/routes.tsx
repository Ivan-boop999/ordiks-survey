import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { RootLayout } from './root-layout'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: lazyRouteComponent(() => import('./pages'), 'NotFoundPage'),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages'), 'HomePage'),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: returnToSearch,
  component: lazyRouteComponent(() => import('./pages'), 'LoginPage'),
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  validateSearch: returnToSearch,
  component: lazyRouteComponent(() => import('./pages'), 'SignupPage'),
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: lazyRouteComponent(() => import('./pages'), 'ForgotPasswordPage'),
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: lazyRouteComponent(() => import('./pages'), 'ResetPasswordPage'),
})

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite',
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === 'string' ? search.code : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages'), 'InvitePage'),
})

// ============================================================
// Приложение обследования (ОРДИКС Обследование)
// ============================================================

const surveyWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'surveyWorkspace',
  component: lazyRouteComponent(() => import('@/features/survey'), 'SurveyWorkspaceLayout'),
})

const surveyIndexRoute = createRoute({
  getParentRoute: () => surveyWorkspaceRoute,
  path: '/survey',
  component: lazyRouteComponent(() => import('@/features/survey'), 'SurveyIndexPage'),
})

const surveyProjectsRoute = createRoute({
  getParentRoute: () => surveyWorkspaceRoute,
  path: '/survey/projects',
  component: lazyRouteComponent(() => import('@/features/survey'), 'ProjectsPage'),
})

const surveyProjectRoute = createRoute({
  getParentRoute: () => surveyWorkspaceRoute,
  path: '/survey/p/$projectId',
  component: lazyRouteComponent(() => import('@/features/survey'), 'SurveyProjectIndexPage'),
})

const surveySectionRoute = createRoute({
  getParentRoute: () => surveyWorkspaceRoute,
  path: '/survey/p/$projectId/$section',
  component: lazyRouteComponent(() => import('@/features/survey'), 'SurveySectionPage'),
})

const userWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'userWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'UserWorkspaceLayout'),
})

const userHomeRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app',
  component: lazyRouteComponent(() => import('./pages'), 'UserHomePage'),
})

const userProfileRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/profile',
  component: lazyRouteComponent(() => import('./pages'), 'UserProfilePage'),
})

const userSettingsRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/settings',
  component: lazyRouteComponent(() => import('./pages'), 'UserSettingsPage'),
})

const adminWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'adminWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'AdminWorkspaceLayout'),
})

const adminDashboardRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin',
  component: lazyRouteComponent(() => import('./pages'), 'AdminDashboardPage'),
})

const adminUsersRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/users',
  component: lazyRouteComponent(() => import('./pages'), 'AdminUsersPage'),
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/settings',
  component: lazyRouteComponent(() => import('./pages'), 'AdminSettingsPage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  signupRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  inviteRoute,
  userWorkspaceRoute.addChildren([
    userHomeRoute,
    userProfileRoute,
    userSettingsRoute,
  ]),
  adminWorkspaceRoute.addChildren([
    adminDashboardRoute,
    adminUsersRoute,
    adminSettingsRoute,
  ]),
  surveyWorkspaceRoute.addChildren([
    surveyIndexRoute,
    surveyProjectsRoute,
    surveyProjectRoute,
    surveySectionRoute,
  ]),
])

export const router = createRouter({ routeTree })

function returnToSearch(search: Record<string, unknown>) {
  return {
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
