import { Outlet } from '@tanstack/react-router'

import { Toaster } from '@/components/ui/sonner'

export function RootLayout() {
  return (
    <>
      <Outlet />
      {/* Без смонтированного Toaster все toast.success/toast.error в приложении
          уходили в никуда — пользователь не видел ни подтверждений, ни ошибок. */}
      <Toaster position="top-right" richColors />
    </>
  )
}
