import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ForbiddenPage() {
  return (
    <div className="max-w-xl">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h1 className="m-0 text-4xl leading-tight">403</h1>
          <p className="m-0 text-sm text-muted-foreground">Недостаточно прав для просмотра раздела.</p>
          <div>
            <Link href="/">
              <Button>На главную</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
