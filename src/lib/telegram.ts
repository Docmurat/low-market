/**
 * Отправка сообщений в Telegram (алерты о синке и т.п.).
 * Настройка в .env:
 *   TELEGRAM_BOT_TOKEN — токен бота от @BotFather
 *   TELEGRAM_CHAT_ID   — id чата (узнать: написать боту, потом
 *                        https://api.telegram.org/bot<токен>/getUpdates → chat.id)
 * Если переменные пусты — алерты просто выключены (не ошибка).
 * Файл без 'server-only': им пользуются и скрипты (scripts/sync-alert.ts).
 */

export function isTelegramConfigured(): boolean {
  return Boolean(
    (process.env.TELEGRAM_BOT_TOKEN ?? '').trim() && (process.env.TELEGRAM_CHAT_ID ?? '').trim(),
  );
}

/** true = отправлено; false = выключено или ошибка (ошибка пишется в консоль). */
export async function sendTelegram(text: string): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();
  if (!token || !chatId) {
    console.log('[telegram] не настроен (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID пусты) — пропускаю');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error(`[telegram] HTTP ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[telegram] ошибка отправки:', e);
    return false;
  }
}
