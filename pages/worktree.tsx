import fs from "node:fs/promises";
import path from "node:path";

type Props = {
  sections: SectionItem[];
  contextFiles: ContextItem[];
};

type SectionItem = {
  title: string;
  status: string;
  level: number;
  filePath: string;
};

type ContextItem = {
  name: string;
  filePath: string;
};

function getSectionLevel(sectionTitle: string): number {
  const match = sectionTitle.match(/^Section\s+([0-9]+(?:\.[0-9]+)*)\./);
  if (!match) return 1;
  return match[1].split(".").length;
}

function getSectionNumber(sectionTitle: string): string | null {
  const match = sectionTitle.match(/^Section\s+([0-9]+(?:\.[0-9]+)*)\./);
  return match ? match[1] : null;
}

function buildOpenUrl(absPath: string): string {
  if (!absPath) return "#";
  return `/api/open-file?path=${encodeURIComponent(absPath)}`;
}

function RenderList({ items }: { items: ContextItem[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.name}>
          <a href={buildOpenUrl(item.filePath)}>{item.name}</a>
        </li>
      ))}
    </ul>
  );
}

function RenderSectionTree({ items }: { items: SectionItem[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li
          key={`${item.title}-${item.status}`}
          style={{
            margin: "6px 0",
            marginLeft: `${(item.level - 1) * 22}px`,
            padding: "6px 10px",
            borderLeft: "1px solid #d9d9d9",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#fff",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#6b7280",
              flex: "0 0 8px",
            }}
          />
          <span>{item.title}</span>
          <span
            style={{
              marginLeft: 2,
              fontSize: 12,
              color: "#374151",
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            [{item.status}]
          </span>
          <a
            href={buildOpenUrl(item.filePath)}
            style={{
              marginLeft: 8,
              fontSize: 12,
              color: "#2563eb",
              textDecoration: "none",
            }}
          >
            Файл секции
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function WorktreePage({ sections, contextFiles }: Props) {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ marginBottom: 12 }}>/worktree</h1>
      <p style={{ marginBottom: 16 }}>
        Минимальный дашборд work-flow-tree.
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 8 }}>1. Список секций проекта</h2>
        <RenderSectionTree items={sections} />
      </section>

      <section>
        <h2 style={{ marginBottom: 8 }}>2. Список файлов из папки context</h2>
        <RenderList items={contextFiles} />
      </section>
    </main>
  );
}

export async function getServerSideProps() {
  const workflowRoot = path.join(process.cwd(), "workflow");
  const planFile = path.join(workflowRoot, "plan.md");
  const contextDir = path.join(workflowRoot, "context");

  let sections: SectionItem[] = [];
  let contextFiles: ContextItem[] = [];

  try {
    const planText = await fs.readFile(planFile, "utf8");
    const lines = planText.split("\n");
    const parsed: SectionItem[] = [];
    let currentSection: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith("### Section ")) {
        if (currentSection) {
          parsed.push({
            title: currentSection,
            status: "unknown",
            level: getSectionLevel(currentSection),
            filePath: (() => {
              const num = getSectionNumber(currentSection);
              return num ? path.join(workflowRoot, "sections", `section-${num}.md`) : "";
            })(),
          });
        }
        currentSection = line.replace(/^###\s+/, "").trim();
        continue;
      }

      if (currentSection && line.startsWith("* Статус:")) {
        const status = line.replace("* Статус:", "").trim() || "unknown";
        parsed.push({
          title: currentSection,
          status,
          level: getSectionLevel(currentSection),
          filePath: (() => {
            const num = getSectionNumber(currentSection);
            return num ? path.join(workflowRoot, "sections", `section-${num}.md`) : "";
          })(),
        });
        currentSection = null;
      }
    }

    if (currentSection) {
      parsed.push({
        title: currentSection,
        status: "unknown",
        level: getSectionLevel(currentSection),
        filePath: (() => {
          const num = getSectionNumber(currentSection);
          return num ? path.join(workflowRoot, "sections", `section-${num}.md`) : "";
        })(),
      });
    }

    sections = parsed;
  } catch {}

  try {
    const entries = await fs.readdir(contextDir, { withFileTypes: true });
    contextFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => ({
        name: e.name,
        filePath: path.join(contextDir, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {}

  return {
    props: {
      sections: sections.length ? sections : [{ title: "Секции не найдены", status: "-", level: 1, filePath: "" }],
      contextFiles: contextFiles.length ? contextFiles : [{ name: "Файлы context не найдены", filePath: "" }],
    },
  }
}
