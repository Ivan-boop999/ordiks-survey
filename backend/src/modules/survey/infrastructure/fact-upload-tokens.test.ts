import { describe, expect, test } from 'bun:test'

import type { FactUploadClaims } from '../application/ports'
import { createFactUploadTokens } from './fact-upload-tokens'

const claims: FactUploadClaims = {
  factId: '019c0000-0000-7000-8000-000000000001',
  objectKey: 'projects/019c0000-0000-7000-8000-00000000000a/facts/019c0000-0000-7000-8000-00000000000b',
  contentType: 'image/jpeg',
  byteSize: 2048,
  expiresAt: Math.floor(Date.now() / 1000) + 60,
}

describe('fact upload tokens', () => {
  const tokens = createFactUploadTokens('12345678901234567890123456789012')
  const now = new Date()

  test('round-trips claims for the fact the ticket was issued to', () => {
    const token = tokens.issue(claims)
    expect(tokens.verify(claims.factId, token, now)).toEqual(claims)
  })

  test('rejects a ticket presented for another fact', () => {
    const token = tokens.issue(claims)
    expect(tokens.verify('019c0000-0000-7000-8000-000000000002', token, now)).toBeNull()
  })

  test('rejects an expired ticket', () => {
    const expired = tokens.issue({ ...claims, expiresAt: Math.floor(Date.now() / 1000) - 1 })
    expect(tokens.verify(claims.factId, expired, now)).toBeNull()
  })

  test('rejects tampered payloads and foreign signatures', () => {
    const token = tokens.issue(claims)
    const [version, payload, signature] = token.split('.')
    expect(tokens.verify(claims.factId, `${version}.${payload}.${'a'.repeat(signature.length)}`, now)).toBeNull()

    // Подмена byteSize внутри payload ломает подпись.
    const forgedPayload = Buffer.from(
      Buffer.from(payload, 'base64url').toString('utf8').replace('2048', '1'),
      'utf8',
    ).toString('base64url')
    expect(tokens.verify(claims.factId, `${version}.${forgedPayload}.${signature}`, now)).toBeNull()

    // Тикен, подписанный другим секретом, не проходит.
    const otherSecret = createFactUploadTokens('99999999999999999999999999999999')
    expect(tokens.verify(claims.factId, otherSecret.issue(claims), now)).toBeNull()
  })

  test('rejects malformed tokens without throwing', () => {
    for (const token of ['', 'v1', 'v1.only-two', 'v2.a.b', 'v1.!!!.b']) {
      expect(tokens.verify(claims.factId, token, now)).toBeNull()
    }
  })
})
