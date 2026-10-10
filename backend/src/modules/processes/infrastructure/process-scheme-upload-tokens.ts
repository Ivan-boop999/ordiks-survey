import { createHmac, timingSafeEqual } from 'node:crypto'

import type { ProcessSchemeUploadClaims, ProcessSchemeUploadTokens } from '../application/ports'

/**
 * Самоподписанные тикеты загрузки схем StormBPMN — тот же приём, что у файлов фактов:
 * HMAC над {processId, side, objectKey, contentType, byteSize, expiresAt}. Подтвердить
 * можно только ключ, выданный этому процессу и стороне, и только пока окно не закрылось.
 */
const claimSeparator = '\n'
const version = 'v1'

function deriveSigningKey(jwtSecret: string): Buffer {
  return createHmac('sha256', jwtSecret).update('process-scheme-ticket-v1').digest()
}

function canonicalClaims(claims: ProcessSchemeUploadClaims): string {
  return [
    version,
    claims.processId,
    claims.side,
    claims.objectKey,
    claims.contentType,
    String(claims.byteSize),
    String(claims.expiresAt),
  ].join(claimSeparator)
}

export function createProcessSchemeUploadTokens(jwtSecret: string): ProcessSchemeUploadTokens {
  const signingKey = deriveSigningKey(jwtSecret)

  return {
    issue(claims) {
      const signature = createHmac('sha256', signingKey).update(canonicalClaims(claims)).digest('base64url')
      return `${version}.${Buffer.from(canonicalClaims(claims), 'utf-8').toString('base64url')}.${signature}`
    },

    verify(processId, side, token, now) {
      const parts = token.split('.')
      if (parts.length !== 3 || parts[0] !== version) return null

      let claims: ProcessSchemeUploadClaims
      try {
        const decoded = Buffer.from(parts[1], 'base64url').toString('utf-8').split(claimSeparator)
        if (decoded.length !== 7 || decoded[0] !== version) return null
        const byteSize = Number(decoded[5])
        const expiresAt = Number(decoded[6])
        if (!Number.isInteger(byteSize) || !Number.isInteger(expiresAt)) return null
        claims = {
          processId: decoded[1],
          side: decoded[2] as ProcessSchemeUploadClaims['side'],
          objectKey: decoded[3],
          contentType: decoded[4],
          byteSize,
          expiresAt,
        }
      } catch {
        return null
      }

      const expected = Buffer.from(
        createHmac('sha256', signingKey).update(canonicalClaims(claims)).digest('base64url'),
        'utf-8',
      )
      const provided = Buffer.from(parts[2], 'utf-8')
      const signatureMatches =
        expected.length === provided.length && timingSafeEqual(expected, provided)
      if (!signatureMatches) return null
      if (claims.processId !== processId || claims.side !== side) return null
      if (claims.expiresAt * 1000 <= now.getTime()) return null
      return claims
    },
  }
}
