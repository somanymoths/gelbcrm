import { redirect } from 'next/navigation';
import { getCurrentRole } from '@/lib/auth';

export default async function HomePage() {
  const role = await getCurrentRole();
  redirect(role === 'admin' ? '/funnel' : '/journal');
}
