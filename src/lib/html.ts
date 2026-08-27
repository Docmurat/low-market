/**
 * Минимальная очистка HTML-описаний от поставщика перед выводом через
 * dangerouslySetInnerHTML: убираем скрипты, стили, фреймы и on*-атрибуты.
 * Полноценный санитайзер (DOMPurify) подключим, когда появятся описания от людей.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '');
}

export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(s);
}
