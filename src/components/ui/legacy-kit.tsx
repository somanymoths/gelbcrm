'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

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
    <div className={cn('rounded-md border px-3 py-2 text-sm', msg.type === 'error' && 'border-red-300 bg-red-50 text-red-700', msg.type === 'success' && 'border-emerald-300 bg-emerald-50 text-emerald-700', msg.type === 'warning' && 'border-amber-300 bg-amber-50 text-amber-700')}>
      {msg.text}
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
    <div
      className={cn('rounded-md border px-3 py-2 text-sm', tone === 'error' && 'border-red-300 bg-red-50 text-red-700', tone === 'success' && 'border-emerald-300 bg-emerald-50 text-emerald-700', tone === 'warning' && 'border-amber-300 bg-amber-50 text-amber-700', props.className)}
      style={props.style}
    >
      {props.title ?? props.message ? <div className="font-medium">{props.title ?? props.message}</div> : null}
      {props.description ? <div className="mt-1">{props.description}</div> : null}
      {props.children}
      {props.action ? <div className="mt-2">{props.action}</div> : null}
    </div>
  );
}

export function Avatar({ size = 32, style, children }: { size?: number; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <div
      className="inline-flex items-center justify-center rounded-full bg-muted text-sm font-semibold"
      style={{ width: size, height: size, ...style }}
    >
      {children}
    </div>
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
  const isLink = type === 'link';
  return (
    <button
      {...rest}
      type={htmlType ?? 'button'}
      disabled={loading || rest.disabled}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm',
        type === 'primary' && 'bg-primary text-primary-foreground',
        type === 'default' && 'bg-background',
        type === 'text' && 'border-transparent bg-transparent px-2',
        isLink && 'border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline',
        danger && 'text-destructive',
        className
      )}
    >
      {icon}
      {loading ? '...' : children}
    </button>
  );
}

export function Card(props: React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  loading?: boolean;
  size?: 'small' | 'default';
  hoverable?: boolean;
}) {
  const { title, extra, loading, children, className, style, ...rest } = props;
  return (
    <div className={cn('rounded-lg border bg-card p-3', className)} style={style} {...rest}>
      {title || extra ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="font-medium">{title}</div>
          {extra}
        </div>
      ) : null}
      {loading ? <div className="text-sm text-muted-foreground">Загрузка...</div> : children}
    </div>
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
  return <div className="my-3 h-px bg-border" />;
}

export function Drawer({ open, onClose, title, extra, children, width = 820, size, styles }: { open: boolean; onClose?: () => void; title?: React.ReactNode; extra?: React.ReactNode; children?: React.ReactNode; width?: number; size?: number; closeIcon?: React.ReactNode; styles?: { body?: React.CSSProperties }; destroyOnClose?: boolean }) {
  if (!open) return null;
  const panelWidth = size ?? width;
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full bg-background p-4" style={{ width: panelWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <div className="flex items-center gap-2">{extra}<button onClick={onClose}>✕</button></div>
        </div>
        <div className="h-[calc(100%-48px)] overflow-auto" style={styles?.body}>{children}</div>
      </div>
    </div>
  );
}

function ModalImpl({ open, onCancel, onOk, title, children, okText = 'ОК', cancelText = 'Отмена', confirmLoading, okButtonProps, footer = undefined, width = 520 }: { open: boolean; onCancel?: () => void; onOk?: () => void; title?: React.ReactNode; children?: React.ReactNode; okText?: string; cancelText?: string; confirmLoading?: boolean; okButtonProps?: { danger?: boolean; loading?: boolean; disabled?: boolean }; footer?: React.ReactNode | null; width?: number; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel}>
      <div className="mx-auto mt-20 rounded-lg border bg-background p-4" style={{ width }} onClick={(e) => e.stopPropagation()}>
        {title ? <div className="mb-3 text-lg font-semibold">{title}</div> : null}
        <div>{children}</div>
        {footer === null ? null : footer ?? (
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={onCancel}>{cancelText}</Button>
            <Button type="primary" danger={okButtonProps?.danger} loading={confirmLoading || okButtonProps?.loading} disabled={okButtonProps?.disabled} onClick={onOk}>{okText}</Button>
          </div>
        )}
      </div>
    </div>
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
  return <input {...props} className={cn('h-9 w-full rounded-md border px-3 text-sm', props.className)} />;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number }) {
  return <textarea {...props} className={cn('w-full rounded-md border p-2 text-sm', props.className)} />;
}

export const Input = Object.assign(InputImpl, { TextArea });

export function InputNumber(props: { value?: number | null; onChange?: (value: number | null) => void; min?: number; style?: React.CSSProperties; precision?: number }) {
  return (
    <input
      type="number"
      value={props.value ?? ''}
      min={props.min}
      style={props.style}
      className="h-9 rounded-md border px-3 text-sm"
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
    <select
      disabled={props.disabled}
      value={String(value)}
      className={cn('h-9 rounded-md border px-3 text-sm', props.className)}
      style={props.style}
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
    </select>
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
  return <div className="text-sm text-muted-foreground">{children ?? 'Загрузка...'}</div>;
}

export function Tag({ children, color }: { children?: React.ReactNode; color?: string }) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs', color === 'green' && 'border-emerald-300 bg-emerald-50 text-emerald-700', color === 'blue' && 'border-blue-300 bg-blue-50 text-blue-700')}>{children}</span>;
}

function Text({ children, type, style, strong }: { children?: React.ReactNode; type?: 'secondary'; style?: React.CSSProperties; strong?: boolean }) {
  return <span className={cn(type === 'secondary' && 'text-muted-foreground', strong && 'font-semibold')} style={style}>{children}</span>;
}

function Title({ children, level = 2, style }: { children?: React.ReactNode; level?: number; style?: React.CSSProperties }) {
  const TagName = level <= 2 ? 'h2' : 'h3';
  return React.createElement(TagName, { className: 'font-semibold', style }, children);
}

export const Typography = { Text, Title };
