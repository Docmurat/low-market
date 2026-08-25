export function formatPrice(value: number | string | { toString(): string }): string {
  const num = typeof value === 'number' ? value : parseFloat(value.toString());
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num) + ' ₽';
}
