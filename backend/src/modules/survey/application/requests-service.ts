import type {
  CreateDataRequestRequest,
  DataRequestDto,
  DataRequestsQuery,
  UpdateDataRequestRequest,
  UpdateDataRequestStatusRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { isRequestOverdue } from '../domain/dictionaries'
import { SurveyFailure } from '../domain/errors'
import type { Clock, DataRequestRow, SurveyRepository } from './ports'

type RequestsServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: SurveyRepository
}

/**
 * Запросы данных к заказчику. Просрочка не хранится: overdue вычисляется на лету при выдаче
 * (дедлайн < now и статус != received). Ключевой сценарий портала — клиентские роли
 * (client_lead/client_staff) берут запрос в работу и отмечают получение; остальное — команда.
 */
export class RequestsService {
  constructor(private readonly dependencies: RequestsServiceDependencies) {}

  async listRequests(principal: AuthenticatedPrincipal, projectId: string, query: DataRequestsQuery): Promise<DataRequestDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    const now = this.dependencies.clock.now()
    return (await this.dependencies.repository.listDataRequests(projectId))
      .map((row) => requestDto(row, now))
      .filter((request) => (query.overdue === undefined ? true : request.overdue === query.overdue))
      .filter((request) => (query.status === undefined ? true : request.status === query.status))
      .filter((request) => (query.domainId === undefined ? true : request.domainId === query.domainId))
  }

  async getRequest(principal: AuthenticatedPrincipal, requestId: string): Promise<DataRequestDto> {
    const request = await this.findRequest(requestId)
    await this.dependencies.guard.requireView(principal.id, request.projectId)
    return requestDto(request, this.dependencies.clock.now())
  }

  async createRequest(principal: AuthenticatedPrincipal, projectId: string, input: CreateDataRequestRequest): Promise<DataRequestDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertLinks(projectId, input.domainId ?? null, input.assigneeId ?? null)

    const status = input.status ?? 'requested'
    const now = this.dependencies.clock.now()
    const row = await this.dependencies.repository.createDataRequest({
      projectId,
      domainId: input.domainId ?? null,
      assigneeId: input.assigneeId ?? null,
      what: input.what,
      why: input.why,
      deadline: input.deadline ?? null,
      status,
      receivedAt: status === 'received' ? now : null,
    })
    return requestDto(row, now)
  }

  async updateRequest(principal: AuthenticatedPrincipal, requestId: string, input: UpdateDataRequestRequest): Promise<DataRequestDto> {
    const request = await this.findRequest(requestId)
    await this.dependencies.guard.requireEdit(principal.id, request.projectId)
    const domainId = input.domainId === undefined ? request.domainId : input.domainId ?? null
    const assigneeId = input.assigneeId === undefined ? request.assigneeId : input.assigneeId ?? null
    const status = input.status ?? request.status
    await this.assertLinks(request.projectId, domainId, assigneeId)

    const now = this.dependencies.clock.now()
    const row = await this.dependencies.repository.updateDataRequest(requestId, {
      ...input,
      domainId,
      assigneeId,
      status,
      receivedAt: this.receivedAtFor(request, status, now),
    })
    return row ? requestDto(row, now) : requestDto(request, now)
  }

  /**
   * Смена статуса: команда — всегда; клиентские роли client_lead/client_staff — их ключевой
   * сценарий портала («взять в работу», «получено»). received проставляет receivedAt,
   * уход с received — сбрасывает.
   */
  async updateStatus(
    principal: AuthenticatedPrincipal,
    requestId: string,
    input: UpdateDataRequestStatusRequest,
  ): Promise<DataRequestDto> {
    const request = await this.findRequest(requestId)
    const access = await this.dependencies.guard.context(principal.id, request.projectId)
    if (!access.edit && !canAnswerRequest(access.memberRole)) {
      // Участник знает о запросе — честный 403; постороннему — 404.
      throw new SurveyFailure(
        access.view ? 'forbidden' : 'not_found',
        access.view ? 'Only the Ordiks team and client members can update this request' : 'Request not found',
      )
    }

    const now = this.dependencies.clock.now()
    const row = await this.dependencies.repository.updateDataRequest(requestId, {
      status: input.status,
      receivedAt: this.receivedAtFor(request, input.status, now),
    })
    return row ? requestDto(row, now) : requestDto(request, now)
  }

  async deleteRequest(principal: AuthenticatedPrincipal, requestId: string): Promise<void> {
    const request = await this.findRequest(requestId)
    await this.dependencies.guard.requireEdit(principal.id, request.projectId)
    await this.dependencies.repository.deleteDataRequest(requestId)
  }

  private receivedAtFor(request: Pick<DataRequestRow, 'receivedAt'>, status: string, now: Date): Date | null {
    if (status !== 'received') return null
    return request.receivedAt ?? now
  }

  private async assertLinks(projectId: string, domainId: string | null, assigneeId: string | null) {
    if (domainId != null) {
      const domain = await this.dependencies.repository.findDomainById(domainId)
      if (!domain || domain.projectId !== projectId) {
        throw new SurveyFailure('invalid', 'Domain does not belong to this project')
      }
    }
    if (assigneeId != null) {
      // Ответственный — участник проекта (обычно со стороны заказчика).
      const memberRole = await this.dependencies.repository.findMemberRole(projectId, assigneeId)
      if (memberRole === null) {
        throw new SurveyFailure('invalid', 'Assignee must be a member of this project')
      }
    }
  }

  private async findRequest(requestId: string) {
    const request = await this.dependencies.repository.findDataRequestById(requestId)
    if (!request) throw new SurveyFailure('not_found', 'Request not found')
    return request
  }
}

/// Роли портала, которым разрешено отвечать на запросы (canAnswer прототипа).
export function canAnswerRequest(memberRole: string | null): boolean {
  return memberRole === 'client_lead' || memberRole === 'client_staff'
}

export function requestDto(row: DataRequestRow, now: Date): DataRequestDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    assigneeId: row.assigneeId,
    what: row.what,
    why: row.why,
    deadline: row.deadline?.toISOString() ?? null,
    status: row.status,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    overdue: isRequestOverdue({ deadline: row.deadline, status: row.status, now }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
