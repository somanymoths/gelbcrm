const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya'
};

export type InstructionStatus = 'draft' | 'published';

export const INSTRUCTION_UNTITLED = 'Без названия';

export type TiptapJsonContent = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonContent[];
};

export function createDefaultInstructionDoc(): TiptapJsonContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: INSTRUCTION_UNTITLED }]
      },
      {
        type: 'paragraph'
      }
    ]
  };
}

export function createDefaultInstructionHtml(): string {
  return `<h1>${INSTRUCTION_UNTITLED}</h1><p></p>`;
}

export function safeParseInstructionJson(input: unknown): TiptapJsonContent {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as TiptapJsonContent;
      return parsed && typeof parsed === 'object' ? parsed : createDefaultInstructionDoc();
    } catch {
      return createDefaultInstructionDoc();
    }
  }

  if (input && typeof input === 'object') {
    return input as TiptapJsonContent;
  }

  return createDefaultInstructionDoc();
}

export function getInstructionTitleFromDoc(docInput: unknown): string {
  const doc = safeParseInstructionJson(docInput);
  const title = findHeadingText(doc, 1);
  return title || INSTRUCTION_UNTITLED;
}

function findHeadingText(node: TiptapJsonContent, level: number): string {
  if (!node || typeof node !== 'object') return '';

  if (node.type === 'heading' && typeof (node as { attrs?: { level?: number } }).attrs?.level === 'number') {
    if ((node as { attrs?: { level?: number } }).attrs?.level === level) {
      return extractNodeText(node).trim();
    }
  }

  const children = Array.isArray(node.content) ? node.content : [];
  for (const child of children) {
    const text = findHeadingText(child, level);
    if (text) return text;
  }

  return '';
}

function extractNodeText(node: TiptapJsonContent): string {
  const ownText = typeof node.text === 'string' ? node.text : '';
  const children = Array.isArray(node.content) ? node.content : [];
  const nestedText = children.map((child) => extractNodeText(child)).join('');
  return `${ownText}${nestedText}`;
}

export function slugifyInstructionTitle(title: string): string {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return 'bez-nazvaniya';

  const transliterated = Array.from(normalized)
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('');

  const slug = transliterated
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'bez-nazvaniya';
}

export function ensureUniqueSlug(baseSlug: string, suffix: number): string {
  if (suffix <= 1) return baseSlug;
  return `${baseSlug}-${suffix}`;
}

export function parseOldSlugs(input: unknown): string[] {
  if (Array.isArray(input)) {
    return normalizeOldSlugs(input);
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      if (Array.isArray(parsed)) return normalizeOldSlugs(parsed);
      return [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeOldSlugs(input: unknown[]): string[] {
  const values = input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  return Array.from(new Set(values));
}
