import { describe, expect, test } from 'bun:test'

import { escapeHtml, sanitizeReportHtml } from './sanitize'

describe('sanitizeReportHtml: белый список тегов без атрибутов', () => {
  test('сохраняет разрешённые теги разметки прототипа', () => {
    const html =
      '<h3>Раздел</h3><p>Текст <b>жирный</b> и <i>курсив</i>, <em>акцент</em>, <strong>сильно</strong>.</p>' +
      '<ul><li>пункт</li></ul><ol><li>нумерованный</li></ol>' +
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>' +
      '<h4>Подраздел</h4><p>строка<br>вторая строка</p>'
    expect(sanitizeReportHtml(html)).toBe(html)
  })

  test('вырезает script со содержимым и незакрытые хвосты', () => {
    expect(sanitizeReportHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>')
    expect(sanitizeReportHtml('<script src="x.js">')).toBe('')
    expect(sanitizeReportHtml('<p>a</p><script>bad</script><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  test('вырезает style и iframe целиком', () => {
    expect(sanitizeReportHtml('<style>p{color:red}</style><p>текст</p>')).toBe('<p>текст</p>')
    expect(sanitizeReportHtml('<iframe src="https://evil"></iframe>ok')).toBe('ok')
    expect(sanitizeReportHtml('<p>x</p><iframe>inner</iframe>')).toBe('<p>x</p>')
  })

  test('убирает on*-атрибуты вместе со всеми атрибутами разрешённых тегов', () => {
    expect(sanitizeReportHtml('<p onclick="alert(1)" class="x">текст</p>')).toBe('<p>текст</p>')
    expect(sanitizeReportHtml('<td onmouseover=alert(1)>1</td>')).toBe('<td>1</td>')
    // on* без кавычек тоже
    expect(sanitizeReportHtml("<tr onmouseover=alert(1)><td>1</td></tr>")).toBe('<tr><td>1</td></tr>')
  })

  test('javascript:/data: в href и посторонние теги исчезают, текст остаётся', () => {
    expect(sanitizeReportHtml('<a href="javascript:alert(1)">ссылка</a>')).toBe('ссылка')
    expect(sanitizeReportHtml('<a href="https://ok.ru">сайт</a>')).toBe('сайт')
    expect(sanitizeReportHtml('<img src="x" onerror="alert(1)">до/после')).toBe('до/после')
    expect(sanitizeReportHtml('<div style="background:url(javascript:1)">блок</div>')).toBe('блок')
  })

  test('комментарии и незнакомые теги вырезаются, вложенный текст сохраняется', () => {
    expect(sanitizeReportHtml('<p>a</p><!-- secret --><p>b</p>')).toBe('<p>a</p><p>b</p>')
    expect(sanitizeReportHtml('<span>внутри</span>')).toBe('внутри')
    expect(sanitizeReportHtml('<H3 Upper>Заголовок</H3>')).toBe('<h3>Заголовок</h3>')
  })

  test('escapeHtml экранирует спецсимволы для автотовставок', () => {
    expect(escapeHtml('<b>"a"&\'b\'</b>')).toBe('&lt;b&gt;&quot;a&quot;&amp;&#39;b&#39;&lt;/b&gt;')
    expect(escapeHtml(null)).toBe('')
  })
})
