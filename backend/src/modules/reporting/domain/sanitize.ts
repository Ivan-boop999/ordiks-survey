/**
 * Санитизация HTML тела раздела отчёта — белый список, а не чёрный: отчёт уезжает третьей
 * стороне, поэтому всё, что не разрешено явно, вырезается. Разрешены только теги разметки
 * прототипа (b/i/em/strong/p/br/ul/ol/li/table/thead/tbody/tr/td/th/h3/h4) БЕЗ атрибутов:
 * серверные автотовставки атрибутов не используют, а любые атрибуты (style, href, on*) —
 * вектор для активного содержимого. Текст вне тегов сохраняется как есть; содержимое
 * script/style/iframe вырезается вместе с тегами.
 */

const ALLOWED_TAGS = new Set([
  'b',
  'i',
  'em',
  'strong',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'h3',
  'h4',
])

/// Парные теги, у которых вырезается и содержимое (не разметка, а код).
const DROP_WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed']

const tagPattern = /<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>?/g

export function sanitizeReportHtml(html: string): string {
  let result = String(html ?? '')

  // Блоки с содержимым: <script ...>...</script> вместе с внутренностями.
  for (const tag of DROP_WITH_CONTENT) {
    const paired = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, 'gi')
    result = result.replace(paired, '')
    // Незакрытые хвосты и одиночные вхождения.
    const loose = new RegExp(`<\\s*/?\\s*${tag}\\b[^>]*>?`, 'gi')
    result = result.replace(loose, '')
  }

  // Комментарии и Doctype/CDATA-обёртки не нужны печатному виду.
  result = result.replace(/<!--[\s\S]*?-->/g, '')

  // Каждый тег: имя в белом списке → выкидываем атрибуты целиком; иначе вырезаем тег.
  result = result.replace(tagPattern, (match) => {
    const name = match.match(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/)?.[1]?.toLowerCase()
    if (!name) return ''
    if (!ALLOWED_TAGS.has(name)) return ''
    const closing = /^<\s*\//.test(match)
    return closing ? `</${name}>` : `<${name}>`
  })

  return result
}

/** Экранирование текста для серверных автотовставок (значения из БД — как есть в ячейки). */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
