'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import type { Content } from '@tiptap/core';
import { CircleCheck, Copy, Loader, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';

type RoleUser = { id: string; role: 'admin' | 'teacher'; login: string };
type InstructionStatus = 'draft' | 'published';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type InstructionListItem = {
  id: string;
  slug: string;
  title: string;
  status: InstructionStatus;
  updatedAt: string;
  acknowledged?: boolean;
};

type InstructionDetail = {
  id: string;
  slug: string;
  title: string;
  status: InstructionStatus;
  contentJson: unknown;
  contentHtml: string;
  updatedAt: string;
};

type AcknowledgeState = {
  acknowledged: boolean;
  acknowledgedAt: string | null;
};

type TeacherAckItem = {
  teacherId: string;
  fullName: string;
  acknowledgedAt: string | null;
};

type TocItem = {
  id: string;
  text: string;
  index?: number;
};

type SaveSnapshot = {
  instructionId: string;
  slug: string;
  contentJson: unknown;
  contentHtml: string;
  status: InstructionStatus;
};

const AUTOSAVE_DEBOUNCE_MS = 700;
const instructionsSidebarCache: {
  loaded: boolean;
  roleUser: RoleUser | null;
  list: InstructionListItem[];
} = {
  loaded: false,
  roleUser: null,
  list: []
};
const instructionDetailCache = new Map<string, InstructionDetail>();

function CopyLinkIcon({ copied }: { copied: boolean }) {
  const baseTransitionClass =
    'absolute inset-0 h-4 w-4 transition-[transform,opacity,filter] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)]';

  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <Copy
        className={`${baseTransitionClass} ${
          copied ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'
        }`}
      />
      <CircleCheck
        className={`${baseTransitionClass} text-emerald-600 ${
          copied ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]'
        }`}
      />
    </span>
  );
}

export function InstructionsSection({ initialSlug }: { initialSlug?: string }) {
  const cachedInitialDetail = initialSlug ? instructionDetailCache.get(initialSlug) ?? null : null;
  const pathname = usePathname();
  const router = useRouter();
  const isSlugRoute = pathname?.startsWith('/instructions/') ?? false;
  const [roleUser, setRoleUser] = useState<RoleUser | null>(() => instructionsSidebarCache.roleUser);
  const [listLoading, setListLoading] = useState(() => !instructionsSidebarCache.loaded);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [list, setList] = useState<InstructionListItem[]>(() => instructionsSidebarCache.list);
  const [detail, setDetail] = useState<InstructionDetail | null>(cachedInitialDetail);
  const [currentStatus, setCurrentStatus] = useState<InstructionStatus>(cachedInitialDetail?.status ?? 'draft');
  const [persistedStatus, setPersistedStatus] = useState<InstructionStatus>(cachedInitialDetail?.status ?? 'draft');
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [acknowledgeState, setAcknowledgeState] = useState<AcknowledgeState>({ acknowledged: false, acknowledgedAt: null });
  const [toggleLoading, setToggleLoading] = useState(false);
  const [teacherAcknowledged, setTeacherAcknowledged] = useState<TeacherAckItem[]>([]);
  const [teacherNotAcknowledged, setTeacherNotAcknowledged] = useState<TeacherAckItem[]>([]);
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [processedHtml, setProcessedHtml] = useState('');
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [readProgress, setReadProgress] = useState(0);
  const [readUnlockedByInstruction, setReadUnlockedByInstruction] = useState<Record<string, boolean>>({});
  const pendingSaveTimerRef = useRef<number | null>(null);
  const activeInstructionIdRef = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const currentSlugRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<SaveSnapshot | null>(null);
  const lastSavedSignatureRef = useRef<string>('');
  const copyResetTimerRef = useRef<number | null>(null);
  const currentStatusRef = useRef<InstructionStatus>(currentStatus);
  const readonlyEditorWrapperRef = useRef<HTMLDivElement | null>(null);
  const readonlyContentRef = useRef<HTMLDivElement | null>(null);
  const [ackButtonLeft, setAckButtonLeft] = useState<number | null>(null);

  const isAdmin = roleUser?.role === 'admin';
  const selectedSlug = detail?.slug ?? initialSlug ?? null;

  const orderedList = useMemo(() => {
    if (!isAdmin) return list;
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'draft' ? -1 : 1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
  }, [isAdmin, list]);

  useEffect(() => {
    currentStatusRef.current = currentStatus;
  }, [currentStatus]);

  const loadRoleAndList = useCallback(async () => {
    if (!instructionsSidebarCache.loaded) {
      setListLoading(true);
    }
    setRequestError(null);
    try {
      const [meResp, listResp] = await Promise.all([fetch('/api/v1/auth/me'), fetch('/api/v1/instructions')]);

      if (meResp.ok) {
        const meData = (await meResp.json()) as RoleUser;
        setRoleUser(meData);
      }

      if (listResp.ok) {
        const listData = (await listResp.json()) as { items: InstructionListItem[] };
        setList(listData.items);
      } else {
        setList([]);
      }
    } catch {
      setList([]);
      setRequestError('Не удалось загрузить данные. Проверьте соединение и обновите страницу.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    instructionsSidebarCache.loaded = !listLoading;
    instructionsSidebarCache.roleUser = roleUser;
    instructionsSidebarCache.list = list;
  }, [list, listLoading, roleUser]);

  const loadInstruction = useCallback(
    async (slug: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const cachedDetail = instructionDetailCache.get(slug);
      if (cachedDetail) {
        setDetail(cachedDetail);
        setCurrentStatus(cachedDetail.status);
        activeInstructionIdRef.current = cachedDetail.id;
        currentSlugRef.current = cachedDetail.slug;
      }
      if (!silent && !cachedDetail) {
        setDetailLoading(true);
      }
      setRequestError(null);
      setNotFound(false);
      setUnavailable(false);
      try {
        const response = await fetch(`/api/v1/instructions/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        const data = (await response.json().catch(() => null)) as
          | {
              instruction: InstructionDetail;
              acknowledgeState?: AcknowledgeState;
              teacherAcknowledgements?: { acknowledged: TeacherAckItem[]; notAcknowledged: TeacherAckItem[] };
            }
          | { code?: string }
          | null;

        if (response.status === 404) {
          instructionDetailCache.delete(slug);
          setDetail(null);
          setNotFound(true);
          return;
        }

        if (response.status === 403 && (data as { code?: string } | null)?.code === 'INSTRUCTION_UNAVAILABLE') {
          instructionDetailCache.delete(slug);
          setDetail(null);
          setUnavailable(true);
          return;
        }

        if (!response.ok || !data || !('instruction' in data)) {
          instructionDetailCache.delete(slug);
          setDetail(null);
          setNotFound(true);
          return;
        }

        instructionDetailCache.set(data.instruction.slug, data.instruction);
        setDetail(data.instruction);
        currentSlugRef.current = data.instruction.slug;
        setCurrentStatus(data.instruction.status);
        setPersistedStatus(data.instruction.status);
        activeInstructionIdRef.current = data.instruction.id;
        setSaveState('saved');

        if (isAdmin) {
          setTeacherAcknowledged(data.teacherAcknowledgements?.acknowledged ?? []);
          setTeacherNotAcknowledged(data.teacherAcknowledgements?.notAcknowledged ?? []);
          setAcknowledgeState({ acknowledged: false, acknowledgedAt: null });
        } else {
          setTeacherAcknowledged([]);
          setTeacherNotAcknowledged([]);
          setAcknowledgeState(data.acknowledgeState ?? { acknowledged: false, acknowledgedAt: null });
        }
      } catch {
        if (!silent) {
          setDetail(null);
        }
        setRequestError('Не удалось загрузить инструкцию. Проверьте соединение и попробуйте снова.');
      } finally {
        if (!silent) {
          setDetailLoading(false);
        }
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    void loadRoleAndList();
  }, [loadRoleAndList]);

  useEffect(() => {
    if (listLoading) return;
    const slugToOpen = initialSlug ?? null;

    if (slugToOpen) {
      if (detail?.slug !== slugToOpen || notFound || unavailable) {
        void loadInstruction(slugToOpen, { silent: Boolean(detail?.id) });
      }
      return;
    }

    if (list.length === 0) {
      setDetail(null);
      return;
    }

    if (!isSlugRoute) {
      router.replace(`/instructions/${list[0].slug}`);
      return;
    }

    if (detail?.slug !== list[0].slug) {
      void loadInstruction(list[0].slug, { silent: Boolean(detail?.id) });
    }
  }, [detail?.id, detail?.slug, initialSlug, isSlugRoute, list, listLoading, loadInstruction, notFound, router, unavailable]);

  useEffect(() => {
    if (!editorRef.current || !detail || !isAdmin) return;
    if (activeInstructionIdRef.current !== detail.id) {
      activeInstructionIdRef.current = detail.id;
    }
    updateTocFromEditor(editorRef.current);
  }, [detail, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      setProcessedHtml('');
      return;
    }

    const html = detail?.contentHtml ?? '';
    if (!html) {
      setProcessedHtml('');
      setTocItems([]);
      return;
    }

    const prepared = prepareHtmlWithToc(html);
    setProcessedHtml(prepared.html);
    setTocItems(prepared.toc);
  }, [detail?.contentHtml, isAdmin]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!isAdmin) return;
      if (saveState !== 'saving' && pendingSaveTimerRef.current === null) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isAdmin, saveState]);

  function updateTocFromEditor(nextEditor: Editor) {
    const headingTexts = extractH2Texts(nextEditor.getJSON());
    const seen = new Map<string, number>();
    const nextToc: TocItem[] = [];

    headingTexts.forEach((headingText, index) => {
      const text = normalizeHeadingText(headingText);
      if (!text) return;
      const base = slugifyForAnchor(text);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const id = count > 1 ? `${base}-${count}` : base;
      nextToc.push({ id, text: trimHeadingLabel(text), index });
    });

    setTocItems((prev) => (areTocItemsEqual(prev, nextToc) ? prev : nextToc));
  }

  const flushSaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return;

    while (queuedSaveRef.current) {
      const snapshot = queuedSaveRef.current;
      queuedSaveRef.current = null;

      const targetSlug = snapshot.slug;
      if (!targetSlug) return;

      const signature = JSON.stringify([
        targetSlug,
        snapshot.instructionId,
        snapshot.status,
        snapshot.contentHtml.length,
        snapshot.contentHtml
      ]);
      if (signature === lastSavedSignatureRef.current) {
        setSaveState('saved');
        continue;
      }

      saveInFlightRef.current = true;
      setSaveState('saving');

      let response: Response;
      try {
        response = await fetch(`/api/v1/instructions/${encodeURIComponent(targetSlug)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot)
        });
      } catch {
        saveInFlightRef.current = false;
        setSaveState('error');
        return;
      }
      if (!response.ok) {
        saveInFlightRef.current = false;
        setSaveState('error');
        return;
      }

      const data = (await response.json()) as { instruction: InstructionDetail };
      lastSavedSignatureRef.current = signature;
      const isActiveInstruction = activeInstructionIdRef.current === data.instruction.id;
      instructionDetailCache.set(data.instruction.slug, data.instruction);
      if (targetSlug !== data.instruction.slug) {
        instructionDetailCache.delete(targetSlug);
      }
      if (isActiveInstruction) {
        currentSlugRef.current = data.instruction.slug;
        setPersistedStatus(data.instruction.status);
      }

      // Keep editor content local to avoid resetting cursor/selection on each autosave.
      if (isActiveInstruction) {
        setDetail((prev) => {
          if (!prev) return data.instruction;
          return {
            ...prev,
            slug: data.instruction.slug,
            title: data.instruction.title,
            status: data.instruction.status,
            updatedAt: data.instruction.updatedAt
          };
        });
      }

      setList((prev) => {
        const replaced = prev.map((item) =>
          item.id === data.instruction.id
            ? {
                ...item,
                slug: data.instruction.slug,
                title: data.instruction.title,
                status: data.instruction.status,
                updatedAt: data.instruction.updatedAt
              }
            : item
        );
        return replaced.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      });

      setSaveState('saved');
      saveInFlightRef.current = false;

      // Prevent redundant route updates during autosave. Navigate only when slug actually changed.
      if (isActiveInstruction && targetSlug !== data.instruction.slug && pathname !== `/instructions/${data.instruction.slug}`) {
        router.replace(`/instructions/${data.instruction.slug}`);
      }
    }
  }, [pathname, router]);

  const scheduleAutosave = useCallback(
    (nextEditor: Editor) => {
      if (!isAdmin || !detail) return;

      if (pendingSaveTimerRef.current) {
        window.clearTimeout(pendingSaveTimerRef.current);
      }

      setSaveState('idle');
      pendingSaveTimerRef.current = window.setTimeout(() => {
        pendingSaveTimerRef.current = null;
        queuedSaveRef.current = {
          instructionId: detail.id,
          slug: detail.slug,
          contentJson: nextEditor.getJSON(),
          contentHtml: nextEditor.getHTML(),
          status: currentStatusRef.current
        };
        void flushSaveQueue();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [detail, flushSaveQueue, isAdmin]
  );

  const handleCreateInstruction = useCallback(async () => {
    if (!isAdmin) return;
    setCreating(true);
    try {
      const response = await fetch('/api/v1/instructions', { method: 'POST' });
      if (!response.ok) return;
      const data = (await response.json()) as { instruction: InstructionDetail };
      setList((prev) =>
        [
          ...prev,
          {
            id: data.instruction.id,
            slug: data.instruction.slug,
            title: data.instruction.title,
            status: data.instruction.status,
            updatedAt: data.instruction.updatedAt
          }
        ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      );
      activeInstructionIdRef.current = data.instruction.id;
      currentSlugRef.current = data.instruction.slug;
      router.push(`/instructions/${data.instruction.slug}`);
    } finally {
      setCreating(false);
    }
  }, [isAdmin, router]);

  const handleDeleteInstruction = useCallback(async () => {
    if (!isAdmin || !detail) return;
    const confirmed = window.confirm('Удалить навсегда?');
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/v1/instructions/${encodeURIComponent(detail.slug)}`, { method: 'DELETE' });
      if (!response.ok) return;

      setList((prev) => prev.filter((item) => item.id !== detail.id));
      instructionDetailCache.delete(detail.slug);
      const nextItems = list.filter((item) => item.id !== detail.id);
      if (nextItems.length > 0) {
        router.replace(`/instructions/${nextItems[0].slug}`);
      } else {
        setDetail(null);
        router.replace('/instructions');
      }
    } finally {
      setDeleting(false);
    }
  }, [detail, isAdmin, list, router]);

  const handleToggleAcknowledge = useCallback(async () => {
    if (!detail || isAdmin || toggleLoading) return;
    setToggleLoading(true);
    try {
      const response = await fetch(`/api/v1/instructions/${encodeURIComponent(detail.slug)}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged: !acknowledgeState.acknowledged })
      });

      if (!response.ok) return;
      const data = (await response.json()) as AcknowledgeState;
      setAcknowledgeState(data);
      setList((prev) =>
        prev.map((item) =>
          detail && item.id === detail.id
            ? {
                ...item,
                acknowledged: data.acknowledged
              }
            : item
        )
      );
    } finally {
      setToggleLoading(false);
    }
  }, [acknowledgeState.acknowledged, detail, isAdmin, toggleLoading]);

  const handleCopyLink = useCallback(async () => {
    if (!detail || detail.status !== 'published') return;
    const absoluteUrl = `${window.location.origin}/instructions/${detail.slug}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = absoluteUrl;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyLinkState('copied');
    } catch {
      setCopyLinkState('error');
    }

    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyLinkState('idle');
      copyResetTimerRef.current = null;
    }, 1800);
  }, [detail]);

  const handleTogglePublish = useCallback(async () => {
    if (!isAdmin || !detail) return;
    const previousStatus = currentStatus;
    const nextStatus: InstructionStatus = currentStatus === 'published' ? 'draft' : 'published';
    setCurrentStatus(nextStatus);
    setDetail((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    setList((prev) => {
      const next = prev.map((item) =>
        item.id === detail.id
          ? {
              ...item,
              status: nextStatus
            }
          : item
      );
      return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    });
    currentStatusRef.current = nextStatus;

    try {
      const response = await fetch(`/api/v1/instructions/${encodeURIComponent(detail.slug)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });

      if (!response.ok) {
        throw new Error('STATUS_UPDATE_FAILED');
      }

      const data = (await response.json()) as { instruction: InstructionDetail };
      setPersistedStatus(data.instruction.status);
      instructionDetailCache.set(data.instruction.slug, data.instruction);
      setDetail((prev) => (prev && prev.id === data.instruction.id ? { ...prev, status: data.instruction.status, updatedAt: data.instruction.updatedAt } : prev));
      setList((prev) => {
        const next = prev.map((item) =>
          item.id === data.instruction.id
            ? {
                ...item,
                status: data.instruction.status,
                updatedAt: data.instruction.updatedAt
              }
            : item
        );
        return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      });
    } catch {
      setCurrentStatus(previousStatus);
      currentStatusRef.current = previousStatus;
      setDetail((prev) => (prev ? { ...prev, status: previousStatus } : prev));
      setList((prev) => {
        const next = prev.map((item) =>
          item.id === detail.id
            ? {
                ...item,
                status: previousStatus
              }
            : item
        );
        return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      });
      setPersistedStatus(previousStatus);
    }
  }, [currentStatus, detail, isAdmin]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAdmin || detail?.status !== 'published') {
      setAckButtonLeft(null);
      return;
    }

    function syncAckButtonPosition() {
      const wrapper = readonlyEditorWrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      setAckButtonLeft(rect.left + rect.width / 2);
    }

    syncAckButtonPosition();
    window.addEventListener('resize', syncAckButtonPosition);
    window.addEventListener('scroll', syncAckButtonPosition, { passive: true });

    return () => {
      window.removeEventListener('resize', syncAckButtonPosition);
      window.removeEventListener('scroll', syncAckButtonPosition);
    };
  }, [detail?.status, isAdmin]);

  useEffect(() => {
    if (isAdmin || detail?.status !== 'published' || !detail?.id) {
      setReadProgress(0);
      return;
    }
    const detailId = detail.id;
    // Temporary QA mode: always start from 0 after page load/reopen.
    setReadProgress(0);
    setReadUnlockedByInstruction((prev) => ({ ...prev, [detailId]: false }));

    function syncReadProgress() {
      const contentNode = readonlyContentRef.current;
      if (!contentNode) return;
      const rect = contentNode.getBoundingClientRect();
      const total = Math.max(rect.height - window.innerHeight, 0);
      if (total <= 0) {
        setReadProgress(1);
        setReadUnlockedByInstruction((prev) => (prev[detailId] ? prev : { ...prev, [detailId]: true }));
        return;
      }

      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const progress = Math.min(Math.max(scrolled / total, 0), 1);
      setReadProgress(progress);
      if (progress >= 0.999) {
        setReadUnlockedByInstruction((prev) => (prev[detailId] ? prev : { ...prev, [detailId]: true }));
      }
    }

    window.addEventListener('resize', syncReadProgress);
    window.addEventListener('scroll', syncReadProgress, { passive: true });

    return () => {
      window.removeEventListener('resize', syncReadProgress);
      window.removeEventListener('scroll', syncReadProgress);
    };
  }, [detail?.id, detail?.status, isAdmin]);

  const handleScrollToAnchor = useCallback((item: TocItem) => {
    if (isAdmin) {
      const dom = editorRef.current?.view?.dom;
      if (dom && typeof item.index === 'number') {
        const headings = Array.from(dom.querySelectorAll('h2'));
        const targetByIndex = headings[item.index] as HTMLElement | undefined;
        if (targetByIndex) {
          targetByIndex.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    }
    const id = item.id;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isAdmin]);

  const isReadLockActive =
    !isAdmin &&
    detail?.status === 'published' &&
    !acknowledgeState.acknowledged &&
    !(detail?.id && readUnlockedByInstruction[detail.id]);

  return (
    <div className="grid min-h-[70vh] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border-r bg-card lg:fixed lg:top-0 lg:left-[var(--sidebar-width)] lg:z-20 lg:h-screen lg:w-[320px] lg:overflow-y-auto">
        {listLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="mt-4 h-9 w-full" />
          </div>
        ) : orderedList.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Список инструкций пуст.</div>
        ) : (
          <ul className="space-y-1 p-4">
            {orderedList.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/instructions/${item.slug}`}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition hover:bg-accent ${
                    selectedSlug === item.slug ? 'bg-accent' : ''
                  }`}
                >
                  <span className="line-clamp-1 pr-3">{item.title}</span>
                  {isAdmin ? (
                    <Badge variant={item.status === 'published' ? 'default' : 'secondary'}>
                      {item.status === 'published' ? 'Опубликовано' : 'Черновик'}
                    </Badge>
                  ) : (
                    <Badge variant={item.acknowledged ? 'default' : 'secondary'}>
                      {item.acknowledged ? 'Изучен' : 'Не изучен'}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
            {isAdmin ? (
              <li>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => void handleCreateInstruction()}
                  disabled={creating}
                >
                  {creating ? <Loader className="size-4 animate-spin" /> : <Plus />}
                  Новый документ
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </aside>

      <section className="bg-card lg:col-start-2">
        {detailLoading ? (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 p-4">
              <Skeleton className="mb-3 h-11 w-full" />
              <Skeleton className="mb-2 h-8 w-48" />
              <Skeleton className="mb-2 h-5 w-full" />
              <Skeleton className="mb-2 h-5 w-11/12" />
              <Skeleton className="mb-2 h-5 w-10/12" />
              <Skeleton className="mb-2 h-5 w-full" />
              <Skeleton className="h-[420px] w-full" />
            </div>
            <aside className="border-l p-4">
              <Skeleton className="mb-4 h-9 w-full" />
              <Skeleton className="mb-4 h-28 w-full" />
              <Skeleton className="mb-4 h-44 w-full" />
              <Skeleton className="h-9 w-32" />
            </aside>
          </div>
        ) : requestError && !detail ? (
          <div className="flex min-h-[420px] items-center justify-center px-6 text-sm text-destructive">
            {requestError}
          </div>
        ) : notFound ? (
          <div className="flex min-h-[420px] items-center justify-center px-6 text-sm text-muted-foreground">
            Инструкция не найдена
          </div>
        ) : unavailable ? (
          <div className="flex min-h-[420px] items-center justify-center px-6 text-sm text-muted-foreground">
            Инструкция недоступна
          </div>
        ) : !detail ? (
          <div className="flex min-h-[420px] items-center justify-center px-6 text-sm text-muted-foreground">
            Выберите инструкцию в левом списке.
          </div>
        ) : (
          <>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0">
                {isAdmin ? (
                  <>
                    <SimpleEditor
                      editable
                      className="min-h-[500px]"
                      saveState={saveState}
                      content={detail.contentJson as Content}
                      onCreate={(nextEditor) => {
                        editorRef.current = nextEditor;
                        updateTocFromEditor(nextEditor);
                      }}
                      onUpdate={(nextEditor) => {
                        editorRef.current = nextEditor;
                        updateTocFromEditor(nextEditor);
                        scheduleAutosave(nextEditor);
                      }}
                      uploadImage={async (file) => {
                        const formData = new FormData();
                        formData.append('file', file);
                        const response = await fetch('/api/v1/instructions/upload', {
                          method: 'POST',
                          body: formData
                        });
                        if (!response.ok) {
                          throw new Error('UPLOAD_FAILED');
                        }
                        const data = (await response.json()) as { url: string };
                        return data.url;
                      }}
                    />
                  </>
                ) : (
                  <>
                    <div ref={readonlyEditorWrapperRef} className="simple-editor-wrapper">
                      <div className="simple-editor-content simple-editor-content-readonly">
                        <div
                          ref={readonlyContentRef}
                          className="tiptap ProseMirror simple-editor readonly"
                          dangerouslySetInnerHTML={{ __html: processedHtml }}
                        />
                      </div>
                    </div>
                    {detail.status === 'published' ? (
                      <>
                        <div className="h-[88px]" aria-hidden />
                        <div
                          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
                          style={ackButtonLeft ? { left: `${ackButtonLeft}px` } : undefined}
                        >
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={isReadLockActive ? 'inline-flex cursor-not-allowed' : 'inline-flex'}>
                                  <Button
                                    onClick={() => void handleToggleAcknowledge()}
                                    disabled={toggleLoading || isReadLockActive}
                                    className="relative h-12 w-[240px] overflow-hidden rounded-[48px] bg-zinc-700 text-base text-white hover:bg-zinc-700/90 disabled:cursor-not-allowed disabled:opacity-100 disabled:hover:bg-zinc-700"
                                  >
                                    <span
                                      aria-hidden
                                      className="pointer-events-none absolute inset-y-0 left-0 bg-black transition-[width] duration-200"
                                      style={{
                                        width: `${Math.round(
                                          (readUnlockedByInstruction[detail.id] ? 1 : readProgress) * 100
                                        )}%`
                                      }}
                                    />
                                    <span className="relative inline-flex items-center gap-2">
                                      {toggleLoading ? <Loader className="size-4 animate-spin" /> : null}
                                      {acknowledgeState.acknowledged ? 'Снять отметку' : 'Понял, принял'}
                                    </span>
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {isReadLockActive ? (
                                <TooltipContent side="top" sideOffset={8}>
                                  Нужно полностью изучить документ
                                </TooltipContent>
                              ) : null}
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </div>

              <aside className="space-y-0 border-l bg-card lg:fixed lg:top-0 lg:right-0 lg:h-screen lg:w-[280px] lg:overflow-y-auto">
                {isAdmin ? (
                  <div className="border-b p-4">
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleTogglePublish()}>
                        {currentStatus === 'published' && persistedStatus !== 'published' ? (
                          <>
                            <Loader className="size-4 animate-spin" />
                            Публикация...
                          </>
                        ) : currentStatus === 'published' ? (
                          'Снять с публикации'
                        ) : (
                          'Опубликовать'
                        )}
                      </Button>
                      {currentStatus === 'published' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 transition-transform duration-150 active:scale-[0.96]"
                          onClick={() => void handleCopyLink()}
                          title={
                            copyLinkState === 'copied'
                              ? 'Скопировано'
                              : copyLinkState === 'error'
                                ? 'Ошибка копирования'
                                : 'Скопировать ссылку'
                          }
                          aria-label="Скопировать ссылку"
                        >
                          <CopyLinkIcon copied={copyLinkState === 'copied'} />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {tocItems.length > 0 ? (
                  <div className="border-b p-4">
                    <h2 className="mb-2 text-sm font-semibold">Навигация</h2>
                    <ul className="space-y-1 text-sm">
                      {tocItems.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleScrollToAnchor(item)}
                            className="text-left text-primary hover:underline"
                          >
                            {item.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {isAdmin ? (
                  <div className="border-b p-4">
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="mb-1 font-medium">Ознакомились</p>
                        {teacherAcknowledged.length === 0 ? (
                          <p className="text-muted-foreground">Пока пусто</p>
                        ) : (
                          <ul className="space-y-1">
                            {teacherAcknowledged.map((item) => (
                              <li key={item.teacherId} className="flex justify-between gap-2">
                                <span className="truncate">{item.fullName || 'Без имени'}</span>
                                <span className="whitespace-nowrap text-muted-foreground">{formatUpdatedAt(item.acknowledgedAt)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 font-medium">Не ознакомились</p>
                        {teacherNotAcknowledged.length === 0 ? (
                          <p className="text-muted-foreground">Пока пусто</p>
                        ) : (
                          <ul className="space-y-1">
                            {teacherNotAcknowledged.map((item) => (
                              <li key={item.teacherId}>{item.fullName || 'Без имени'}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {isAdmin ? (
                  <Button className="ml-4 mt-4" variant="outline" size="sm" onClick={() => void handleDeleteInstruction()} disabled={deleting}>
                    {deleting ? <Loader className="size-4 animate-spin" /> : <Trash2 />}
                    Удалить
                  </Button>
                ) : null}
              </aside>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function prepareHtmlWithToc(html: string): { html: string; toc: TocItem[] } {
  if (typeof window === 'undefined') {
    return { html, toc: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const headings = Array.from(doc.body.querySelectorAll('h2'));
  const seen = new Map<string, number>();
  const toc: TocItem[] = [];

  headings.forEach((heading) => {
    const text = normalizeHeadingText(heading.textContent ?? '');
    if (!text) return;

    const base = slugifyForAnchor(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count > 1 ? `${base}-${count}` : base;
    heading.setAttribute('id', id);
    toc.push({ id, text: trimHeadingLabel(text) });
  });

  return { html: doc.body.innerHTML, toc };
}

function slugifyForAnchor(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return base || 'section';
}

function trimHeadingLabel(value: string): string {
  if (value.length <= 60) return value;
  return `${value.slice(0, 60)}....`;
}

function normalizeHeadingText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return 'Дата обновления: —';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `Дата обновления: ${value}`;
  return `Дата обновления: ${date.toLocaleString('ru-RU')}`;
}

function extractH2Texts(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];

  const current = node as { type?: unknown; attrs?: { level?: unknown }; content?: unknown[]; text?: unknown };
  const results: string[] = [];

  if (current.type === 'heading' && Number(current.attrs?.level) === 2) {
    const text = collectText(current);
    if (text) results.push(text);
  }

  if (Array.isArray(current.content)) {
    current.content.forEach((child) => {
      results.push(...extractH2Texts(child));
    });
  }

  return results;
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const current = node as { text?: unknown; content?: unknown[] };
  const ownText = typeof current.text === 'string' ? current.text : '';
  const childText = Array.isArray(current.content) ? current.content.map((child) => collectText(child)).join('') : '';
  return `${ownText}${childText}`.trim();
}

function areTocItemsEqual(left: TocItem[], right: TocItem[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].id !== right[i].id) return false;
    if (left[i].text !== right[i].text) return false;
    if (left[i].index !== right[i].index) return false;
  }
  return true;
}
