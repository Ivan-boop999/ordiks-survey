import type {
  ConfirmFactUploadRequest,
  CreateFactRequest,
  CreateFactUploadRequest,
  CreateFactUploadResponse,
  FactDto,
  FactFileDownload,
  FactsQuery,
  UpdateFactRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { SurveyFailure } from '../domain/errors'
import type {
  Clock,
  FactUploadClaims,
  FactUploadTicketResult,
  FactUploadTokens,
  FactWithFindingsRow,
  PrivateStorage,
  SurveyRepository,
} from './ports'

type FactsServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: SurveyRepository
  storage: PrivateStorage
  tokens: FactUploadTokens
  /// Ключ объекта под факты: projects/{projectId}/facts/{uuid}.
  createObjectKey: (projectId: string) => string
  /** Удаления, которые не должны ронять основной запрос. */
  deferDelete: (objectKey: string) => void
}

/** Факты: CRUD команды (edit), чтение и скачивание — всем ролям проекта (view). */
export class FactsService {
  constructor(private readonly dependencies: FactsServiceDependencies) {}

  async listFacts(principal: AuthenticatedPrincipal, projectId: string, query: FactsQuery): Promise<FactDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listFacts(projectId, query)).map(factDto)
  }

  async getFact(principal: AuthenticatedPrincipal, factId: string): Promise<FactDto> {
    const fact = await this.findFact(factId)
    await this.dependencies.guard.requireView(principal.id, fact.projectId)
    const withFindings = await this.dependencies.repository.findFactWithFindingsById(factId)
    if (!withFindings) throw new SurveyFailure('not_found', 'Fact not found')
    return factDto(withFindings)
  }

  async createFact(principal: AuthenticatedPrincipal, projectId: string, input: CreateFactRequest): Promise<FactDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const settings = await this.requireProjectSettings(projectId)
    const typeKey = input.typeKey ?? input.kind
    this.assertTypeKey(settings, input.kind, typeKey)
    if (input.domainId != null) await this.assertDomainInProject(projectId, input.domainId)

    const row = await this.dependencies.repository.createFact({
      projectId,
      domainId: input.domainId ?? null,
      authorId: principal.id,
      kind: input.kind,
      typeKey,
      title: input.title,
      description: input.description,
      shop: input.shop,
      factDate: input.factDate ?? this.dependencies.clock.now(),
      objectKey: null,
      fileName: input.fileName ?? null,
    })
    return factDto({ ...row, findings: [] })
  }

  async updateFact(principal: AuthenticatedPrincipal, factId: string, input: UpdateFactRequest): Promise<FactDto> {
    const fact = await this.findFact(factId)
    await this.dependencies.guard.requireEdit(principal.id, fact.projectId)
    const settings = await this.requireProjectSettings(fact.projectId)

    const kind = input.kind ?? (fact.kind as CreateFactRequest['kind'])
    const typeKey = input.typeKey ?? (input.kind ? input.kind : fact.typeKey)
    this.assertTypeKey(settings, kind, typeKey)
    if (input.domainId != null) await this.assertDomainInProject(fact.projectId, input.domainId)

    const row = await this.dependencies.repository.updateFact(factId, {
      ...input,
      kind,
      typeKey,
      domainId: input.domainId === undefined ? undefined : input.domainId ?? null,
      factDate: input.factDate ?? undefined,
      fileName: input.fileName === undefined ? undefined : input.fileName ?? null,
    })
    return row ? this.factWithFindings(row) : this.factWithFindings(fact)
  }

  async deleteFact(principal: AuthenticatedPrincipal, factId: string): Promise<void> {
    const fact = await this.findFact(factId)
    await this.dependencies.guard.requireEdit(principal.id, fact.projectId)
    await this.dependencies.repository.deleteFact(factId)
    // Объект хранилища переживает строку на мгновение: чистим после ответа (как у аватаров).
    if (fact.objectKey) this.dependencies.deferDelete(fact.objectKey)
  }

  // --------------------------------------------------------
  // Файл факта: тикет → PUT в хранилище → подтверждение
  // --------------------------------------------------------

  async createUploadRequest(
    principal: AuthenticatedPrincipal,
    factId: string,
    input: CreateFactUploadRequest,
  ): Promise<CreateFactUploadResponse> {
    const fact = await this.findFact(factId)
    await this.dependencies.guard.requireEdit(principal.id, fact.projectId)

    const objectKey = this.dependencies.createObjectKey(fact.projectId)
    const upload = await this.dependencies.storage.createUploadUrl({
      key: objectKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
    })

    const claims: FactUploadClaims = {
      factId,
      objectKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
      expiresAt: Math.floor(new Date(upload.expiresAt).getTime() / 1000),
    }
    const token = this.dependencies.tokens.issue(claims)

    return {
      upload: {
        token,
        method: upload.method,
        url: upload.url,
        headers: upload.headers,
        contentLength: upload.contentLength,
        expiresAt: upload.expiresAt,
      },
    }
  }

  /**
   * Подтверждение готовности (аналог finalize у аватаров): проверяем, что байты действительно
   * легли в хранилище и совпадают с объявленными типом и размером, и только тогда привязываем
   * объект к факту. Замена файла удаляет прежний объект после ответа.
   */
  async confirmUpload(
    principal: AuthenticatedPrincipal,
    factId: string,
    input: ConfirmFactUploadRequest,
  ): Promise<FactDto> {
    const fact = await this.findFact(factId)
    await this.dependencies.guard.requireEdit(principal.id, fact.projectId)

    const claims = this.dependencies.tokens.verify(factId, input.token, this.dependencies.clock.now())
    if (!claims) {
      throw new SurveyFailure('expired', 'Upload ticket is invalid or has expired; start a new upload')
    }

    const stored = await this.dependencies.storage.headObject(claims.objectKey)
    if (!stored) {
      throw new SurveyFailure('not_completed', 'Upload has not finished; send the file again')
    }
    if (stored.contentLength !== claims.byteSize) {
      await this.discardObject(claims.objectKey)
      throw new SurveyFailure('rejected', 'Uploaded file size does not match the request')
    }
    if (stored.contentType !== claims.contentType) {
      await this.discardObject(claims.objectKey)
      throw new SurveyFailure('rejected', 'Uploaded file type does not match the request')
    }

    const replacedKey = fact.objectKey && fact.objectKey !== claims.objectKey ? fact.objectKey : null
    const row = await this.dependencies.repository.updateFact(factId, {
      objectKey: claims.objectKey,
      fileName: input.fileName,
    })
    if (replacedKey) this.dependencies.deferDelete(replacedKey)

    return row ? this.factWithFindings(row) : this.factWithFindings(fact)
  }

  /** Подписанный URL скачивания: приватный доступ для всех ролей проекта. */
  async createDownloadUrl(principal: AuthenticatedPrincipal, factId: string): Promise<FactFileDownload> {
    const fact = await this.findFact(factId)
    await this.dependencies.guard.requireView(principal.id, fact.projectId)
    if (!fact.objectKey) {
      throw new SurveyFailure('not_found', 'Fact has no stored file')
    }
    const download = await this.dependencies.storage.createDownloadUrl({ key: fact.objectKey })
    return { url: download.url, expiresAt: download.expiresAt }
  }

  async deleteFile(principal: AuthenticatedPrincipal, factId: string): Promise<FactDto> {
    const fact = await this.findFact(factId)
    await this.dependencies.guard.requireEdit(principal.id, fact.projectId)
    if (!fact.objectKey) return this.factWithFindings(fact)

    const row = await this.dependencies.repository.updateFact(factId, { objectKey: null, fileName: null })
    this.dependencies.deferDelete(fact.objectKey)
    return row ? this.factWithFindings(row) : this.factWithFindings(fact)
  }

  private async discardObject(objectKey: string) {
    this.dependencies.deferDelete(objectKey)
  }

  /** После правок всегда перечитываем с находками, чтобы DTO было одинаковым везде. */
  private async factWithFindings(fact: { id: string }): Promise<FactDto> {
    const withFindings = await this.dependencies.repository.findFactWithFindingsById(fact.id)
    if (withFindings) return factDto(withFindings)
    throw new SurveyFailure('not_found', 'Fact not found')
  }

  private async requireProjectSettings(projectId: string) {
    const settings = await this.dependencies.repository.findProjectSettings(projectId)
    if (!settings) throw new SurveyFailure('not_found', 'Project not found')
    return settings
  }

  private assertTypeKey(settings: { factTypes: Array<{ key: string; kind: string }> }, kind: string, typeKey: string) {
    const type = settings.factTypes.find((candidate) => candidate.key === typeKey)
    if (!type) {
      throw new SurveyFailure('invalid', `Fact type "${typeKey}" is not in the project dictionary`)
    }
    if (type.kind !== kind) {
      throw new SurveyFailure('invalid', `Fact type "${typeKey}" has kind "${type.kind}", not "${kind}"`)
    }
  }

  private async assertDomainInProject(projectId: string, domainId: string) {
    const domain = await this.dependencies.repository.findDomainById(domainId)
    if (!domain || domain.projectId !== projectId) {
      throw new SurveyFailure('invalid', 'Domain does not belong to this project')
    }
  }

  private async findFact(factId: string) {
    const fact = await this.dependencies.repository.findFactById(factId)
    if (!fact) throw new SurveyFailure('not_found', 'Fact not found')
    return fact
  }
}

export function factDto(row: FactWithFindingsRow): FactDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    authorId: row.authorId,
    kind: row.kind as FactDto['kind'],
    typeKey: row.typeKey,
    title: row.title,
    description: row.description,
    shop: row.shop,
    factDate: row.factDate.toISOString(),
    objectKey: row.objectKey,
    fileName: row.fileName,
    createdAt: row.createdAt.toISOString(),
    findings: row.findings,
  }
}

export type { FactUploadTicketResult }
