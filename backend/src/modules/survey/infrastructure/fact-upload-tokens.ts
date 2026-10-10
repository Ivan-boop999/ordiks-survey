import { createHmac, timingSafeEqual } from 'node:crypto'

import type { FactUploadClaims, FactUploadTokens } from '../application/ports'

/**
 * Самоподписанные тикеты загрузки файла факта. У аватаров роль тикета играет строка БД
 * (user_avatars.state=pending); для файлов фактов отдельной таблицы нет, поэтому тикет —
 * HMAC над {factId, objectKey, contentType, byteSize, expiresAt}: подтвердить можно только
 * ключ, выданный этому факту, и только пока окно не закрылось.
 *
 * Ключ выводится из JWT_SECRET с меткой (как local signing key хранилища): токен не
 * превращается в JWT и не проверяется ничем, кроме этого модуля.
 */
const claimSeparator = '\n'
const version = 'v1'

function deriveSigningKey(jwtSecret: string): Buffer {
  return createHmac('sha256', jwtSecret).update('fact-upload-ticket-v1').digest()
}

function canonicalClaims(claims: FactUploadClaims): string {
  return [
    version,
    claims.factId,
    claims.objectKey,
    claims.contentType,
    String(claims.byteSize),
    String(claims.expiresAt),
  ].join(claimSeparator)
}

export function createFactUploadTokens(jwtSecret: string): FactUploadTokens {
  const signingKey = deriveSigningKey(jwtSecret)

  return {
    issue(claims) {
      const signature = createHmac('sha256', signingKey).update(canonicalClaims(claims)).digest('base64url')
      return `${version}.${Buffer.from(canonicalClaims(claims), 'utf8').toString('base64url')}.${signature}`
    },

    verify(factId, token, now) {
      const parts = token.split('.')
      if (parts.length !== 3 || parts[0] !== version) return null

      let claims: FactUploadClaims
      try {
        const decoded = Buffer.from(parts[1], 'base64url').toString('utf8').split(claimSeparator)
        if (decoded.length !== 6 || decoded[0] !== version) return null
        const byteSize = Number(decoded[4])
        const expiresAt = Number(decoded[5])
        if (!Number.isInteger(byteSize) || !Number.isInteger(expiresAt)) return null
        claims = {
          factId: decoded[1],
          objectKey: decoded[2],
          contentType: decoded[3],
          byteSize,
          expiresAt,
        }
      } catch {
        return null
      }

      const expected = Buffer.from(
        createHmac('sha256', signingKey).update(canonicalClaims(claims)).digest('base64url'),
        'utf8',
      )
      const provided = Buffer.from(parts[2], 'utf8')
      const signatureMatches =
        expected.length === provided.length && timingSafeEqual(expected, provided)
      if (!signatureMatches) return null
      if (claims.factId !== factId) return null
      if (claims.expiresAt * 1000 <= now.getTime()) return null
      return claims
    },
  }
}
