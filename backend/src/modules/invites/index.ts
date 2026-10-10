import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import { hashPassword } from '../auth'
import type { AuthHttpEnv } from '../auth'
import { InvitesService } from './application/invites-service'
import { generateInviteCode } from './infrastructure/invite-codes'
import { createPrismaInvitesRepository } from './infrastructure/invites-repository'
import { createInvitesRoutes } from './transport/routes'

type CreateInvitesModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}

/** Модуль приглашений: выпуск кодов командой и публичный accept по коду. */
export function createInvitesModule({ db, requireAuth }: CreateInvitesModuleOptions) {
  const service = new InvitesService({
    clock: { now: () => new Date() },
    codes: { generate: generateInviteCode },
    hasher: { hash: hashPassword },
    repository: createPrismaInvitesRepository(db),
  })

  return {
    service,
    routes: createInvitesRoutes({ requireAuth, service }),
  }
}
