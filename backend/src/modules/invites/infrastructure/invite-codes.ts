import { randomBytes } from 'node:crypto'

// Алфавит Крокфорда без похожих символов, чтобы код можно было продиктовать по телефону.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Криптослучайный код вида `K7Q2M-9X4PD`: 10 символов из 50-буквенного алфавита ≈ 56 бит. */
export function generateInviteCode(): string {
  const bytes = randomBytes(10)
  const characters = Array.from(bytes, (byte) => alphabet[byte % alphabet.length])
  return `${characters.slice(0, 5).join('')}-${characters.slice(5).join('')}`
}
