const RUB_FORMATTER = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

export function formatRub(value: number) {
  return RUB_FORMATTER.format(value);
}

export function formatDateTime(value: string) {
  const date = new Date(value);

  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
