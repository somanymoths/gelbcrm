'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Alert as UIAlerBox, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar as UIAvatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button as UIButton } from '@/components/ui/button';
import { Card as UICard, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input as UIInput } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator as UISeparator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea as UITextarea } from '@/components/ui/textarea';

type MessageType = 'success' | 'error' | 'warning';

type MessageApi = {
  success: (text: string) => void;
  error: (text: string) => void;
  warning: (text: string) => void;
};

function useMessage() {
  const [msg, setMsg] = React.useState<{ type: MessageType; text: string } | null>(null);

  const api: MessageApi = React.useMemo(
    () => ({
      success: (text) => setMsg({ type: 'success', text }),
      error: (text) => setMsg({ type: 'error', text }),
      warning: (text) => setMsg({ type: 'warning', text })
    }),
    []
  );

  const contextHolder = msg ? (
    <div className="fixed right-4 top-4 z-[120] max-w-sm">
      <UIAlerBox
        className={cn(
          'ring-1 shadow-lg',
          msg.type === 'error' && 'bg-destructive/10 text-destructive',
          msg.type === 'success' && 'bg-emerald-100/70 text-emerald-800',
          msg.type === 'warning' && 'bg-amber-100/70 text-amber-800'
        )}
      >
        <AlertDescription>{msg.text}</AlertDescription>
      </UIAlerBox>
    </div>
  ) : null;

  return [api, contextHolder] as const;
}

export const message = { useMessage };

export function Alert(props: {
  type?: MessageType;
  title?: React.ReactNode;
  message?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  showIcon?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const tone = props.type ?? 'warning';
  return (
    <UIAlerBox
      className={cn(
        'ring-1',
        tone === 'error' && 'bg-destructive/10 text-destructive',
        tone === 'success' && 'bg-emerald-100/70 text-emerald-800',
        tone === 'warning' && 'bg-amber-100/70 text-amber-800',
        props.className
      )}
      style={props.style}
    >
      {props.title ?? props.message ? <AlertTitle>{props.title ?? props.message}</AlertTitle> : null}
      {props.description ? <AlertDescription>{props.description}</AlertDescription> : null}
      {props.children}
      {props.action ? <div className="mt-2">{props.action}</div> : null}
    </UIAlerBox>
  );
}

export function Avatar({ size = 32, style, children }: { size?: number; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <UIAvatar className="ring-1 ring-border/70" style={{ width: size, height: size, ...style }}>
      <AvatarFallback className="font-medium text-foreground">{children}</AvatarFallback>
    </UIAvatar>
  );
}

type LegacyButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  type?: 'primary' | 'default' | 'text' | 'link';
  size?: 'small' | 'middle' | 'large' | string;
  danger?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  htmlType?: 'button' | 'submit' | 'reset';
};

export function Button(props: LegacyButtonProps) {
  const { type = 'default', danger, loading, icon, htmlType, className, children, ...rest } = props;
  const variant =
    type === 'primary'
      ? 'default'
      : type === 'text'
        ? 'ghost'
        : type === 'link'
          ? 'link'
          : 'outline';
  const size = props.size === 'small' ? 'sm' : props.size === 'large' ? 'lg' : 'default';

  return (
    <UIButton
      {...rest}
      type={htmlType ?? 'button'}
      size={size}
      variant={danger ? 'destructive' : variant}
      disabled={loading || rest.disabled}
      className={cn(type === 'link' && 'px-0', className)}
    >
      {icon}
      {loading ? '...' : children}
    </UIButton>
  );
}

export function Card(props: React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  loading?: boolean;
  size?: 'small' | 'default';
  hoverable?: boolean;
}) {
  const { title, extra, loading, children, className, style, size = 'default', hoverable = false, ...rest } = props;
  return (
    <UICard
      className={cn(
        'ring-1 ring-border/70 bg-card/95',
        hoverable && 'cursor-pointer transition-shadow hover:shadow-md',
        className
      )}
      size={size === 'small' ? 'sm' : 'default'}
      style={style}
      {...rest}
    >
      {title || extra ? (
        <CardHeader className={cn(size === 'small' ? 'px-3 pb-2' : 'px-4 pb-3')}>
          <CardTitle>{title}</CardTitle>
          {extra ? <CardAction>{extra}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(size === 'small' ? 'px-3 pb-3' : 'px-4 pb-4')}>
        {loading ? <Spin /> : children}
      </CardContent>
    </UICard>
  );
}

export const Row = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { gutter?: number | [number, number]; wrap?: boolean }>(
  ({ children, style, className, ...rest }, ref) => (
    <div ref={ref} className={cn('flex flex-wrap gap-3', className)} style={style} {...rest}>
      {children}
    </div>
  )
);
Row.displayName = 'Row';

export function Col({ children, style, className, ...rest }: React.HTMLAttributes<HTMLDivElement> & { xs?: number; md?: number; lg?: number; xl?: number; span?: number }) {
  return (
    <div className={cn('min-w-0 flex-1', className)} style={style} {...rest}>
      {children}
    </div>
  );
}

export function Divider() {
  return <UISeparator className="my-3" />;
}

export function Drawer({ open, onClose, title, extra, children, width = 820, size, styles }: { open: boolean; onClose?: () => void; title?: React.ReactNode; extra?: React.ReactNode; children?: React.ReactNode; width?: number; size?: number; closeIcon?: React.ReactNode; styles?: { body?: React.CSSProperties }; destroyOnClose?: boolean }) {
  const panelWidth = size ?? width;
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <SheetContent side="right" className="p-0" style={{ width: panelWidth, maxWidth: '98vw' }}>
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{title}</SheetTitle>
            {extra ? <div className="pr-8">{extra}</div> : null}
          </div>
        </SheetHeader>
        <div className="h-[calc(100%-72px)] overflow-auto p-4" style={styles?.body}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ModalImpl({ open, onCancel, onOk, title, children, okText = 'ОК', cancelText = 'Отмена', confirmLoading, okButtonProps, footer = undefined, width = 520 }: { open: boolean; onCancel?: () => void; onOk?: () => void; title?: React.ReactNode; children?: React.ReactNode; okText?: string; cancelText?: string; confirmLoading?: boolean; okButtonProps?: { danger?: boolean; loading?: boolean; disabled?: boolean }; footer?: React.ReactNode | null; width?: number; }) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel?.()}>
      <DialogContent className="sm:max-w-none" style={{ width, maxWidth: '96vw' }}>
        {title ? (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        ) : null}
        <div>{children}</div>
        {footer === null ? null : footer ?? (
          <DialogFooter className="bg-transparent p-0 pt-2">
            <Button onClick={onCancel}>{cancelText}</Button>
            <Button
              type="primary"
              danger={okButtonProps?.danger}
              loading={confirmLoading || okButtonProps?.loading}
              disabled={okButtonProps?.disabled}
              onClick={onOk}
            >
              {okText}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

type ConfirmConfig = {
  title?: React.ReactNode;
  content?: React.ReactNode;
  onOk?: () => void | Promise<void>;
  okText?: string;
  cancelText?: string;
  okButtonProps?: { danger?: boolean; loading?: boolean };
};

export const Modal = Object.assign(ModalImpl, {
  confirm: (config: ConfirmConfig) => {
    const ok = window.confirm(String(config.title ?? config.content ?? 'Подтвердите действие'));
    if (ok) void config.onOk?.();
  }
});

function FormImpl({ children, onFinish }: { children?: React.ReactNode; onFinish?: () => void; layout?: string; form?: unknown }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onFinish?.();
      }}
    >
      {children}
    </form>
  );
}

function FormItem({ label, required, children }: { label?: React.ReactNode; required?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-col gap-1">
      {label ? <label className="text-sm font-medium">{label}{required ? ' *' : ''}</label> : null}
      {children}
    </div>
  );
}

export const Form = Object.assign(FormImpl, { Item: FormItem });

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

function InputImpl(props: InputProps) {
  return <UIInput {...props} className={cn('h-9', props.className)} />;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number }) {
  return <UITextarea {...props} className={cn('min-h-24', props.className)} />;
}

export const Input = Object.assign(InputImpl, { TextArea });

export function InputNumber(props: { value?: number | null; onChange?: (value: number | null) => void; min?: number; style?: React.CSSProperties; precision?: number }) {
  return (
    <UIInput
      type="number"
      value={props.value ?? ''}
      min={props.min}
      style={props.style}
      className="h-9"
      onChange={(event) => {
        const value = event.target.value;
        props.onChange?.(value === '' ? null : Number(value));
      }}
    />
  );
}

export function Select(props: {
  value?: string | number | null;
  onChange?: (value: string) => void;
  options?: Array<{ value: string | number; label: React.ReactNode }>;
  allowClear?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  className?: string;
  size?: 'small' | 'middle' | 'large' | string;
  onClick?: React.MouseEventHandler<HTMLSelectElement>;
}) {
  const value = props.value ?? '';
  return (
    <NativeSelect
      disabled={props.disabled}
      value={String(value)}
      className={cn('h-9 min-w-[12rem]', props.className)}
      style={props.style}
      onClick={props.onClick}
      onChange={(event) => {
        const raw = event.target.value;
        props.onChange?.(raw);
      }}
    >
      {props.allowClear ? <option value="">{props.placeholder ?? 'Не выбрано'}</option> : null}
      {!props.allowClear && props.placeholder ? <option value="" disabled>{props.placeholder}</option> : null}
      {props.options?.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {typeof option.label === 'string' ? option.label : String(option.value)}
        </option>
      ))}
    </NativeSelect>
  );
}

export function Space(props: React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical'; size?: number; wrap?: boolean; align?: string }) {
  const direction = props.orientation === 'vertical' ? 'flex-col' : 'flex-row';
  const { children, style, className, ...rest } = props;
  return (
    <div className={cn('flex gap-2', direction, props.wrap && 'flex-wrap', className)} style={style} {...rest}>
      {children}
    </div>
  );
}

export function Spin({ children }: { children?: React.ReactNode; size?: 'small' | 'default' | 'large' }) {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      <span>{children ?? 'Загрузка...'}</span>
    </div>
  );
}

export function Tag({ children, color }: { children?: React.ReactNode; color?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        color === 'green' && 'bg-emerald-100 text-emerald-800',
        color === 'blue' && 'bg-blue-100 text-blue-800'
      )}
    >
      {children}
    </Badge>
  );
}

function Text({ children, type, style, strong }: { children?: React.ReactNode; type?: 'secondary'; style?: React.CSSProperties; strong?: boolean }) {
  return (
    <span className={cn(type === 'secondary' && 'text-muted-foreground', strong && 'font-semibold')} style={style}>
      {children}
    </span>
  );
}

function Title({ children, level = 2, style }: { children?: React.ReactNode; level?: number; style?: React.CSSProperties }) {
  const TagName = level <= 2 ? 'h2' : 'h3';
  return React.createElement(TagName, { className: 'font-heading font-semibold tracking-tight', style }, children);
}

export const Typography = { Text, Title };
