import Link from 'next/link';

export default function PaymentsPage() {
  return (
    <main className="panel">
      <h2>Оплаты</h2>
      <ul>
        <li><Link href="/payments/tariffs">Тарифы</Link></li>
        <li><Link href="/payments/history">История оплат</Link></li>
      </ul>
    </main>
  );
}
