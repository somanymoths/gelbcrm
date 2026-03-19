import Link from 'next/link';
import { Button, Card, CardContent } from '@/components/ui';

export default function ForbiddenPage() {
  return (
    <div className="max-w-[560px]">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h1 className="m-0 text-[32px] leading-tight">403</h1>
          <p className="m-0">Недостаточно прав для просмотра раздела.</p>
          <Button asChild>
            <Link href="/">На главную</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
