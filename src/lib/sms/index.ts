/**
 * Отправка SMS. Пока провайдер не выбран (SMS_PROVIDER в .env пуст) —
 * работаем в локальном режиме: код печатается в консоль dev-сервера.
 * Когда выберем провайдера, добавим сюда файл провайдера и ветку в switch —
 * остальной код трогать не придётся.
 */
import 'server-only';

/** Локальный режим = SMS не уходят, код виден в терминале dev-сервера. */
export function isLocalSmsMode(): boolean {
  return !(process.env.SMS_PROVIDER ?? '').trim();
}

export async function sendLoginCode(phone: string, code: string): Promise<void> {
  const provider = (process.env.SMS_PROVIDER ?? '').trim();
  if (!provider) {
    // ЛОКАЛЬНЫЙ РЕЖИМ: смотреть в терминал, где запущен `npm run dev`.
    console.log(`\n[sms] ================================`);
    console.log(`[sms] Код входа для ${phone}: ${code}`);
    console.log(`[sms] ================================\n`);
    return;
  }
  switch (provider) {
    // case 'smsaero': ... — добавим после выбора провайдера
    default:
      throw new Error(`SMS-провайдер "${provider}" не подключён (src/lib/sms/index.ts)`);
  }
}
