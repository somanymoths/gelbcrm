import { redirect } from 'next/navigation';

export default function TariffsRedirectPage() {
  redirect('/payments?tab=tariffs');
}
