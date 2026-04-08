"use client"

import { useEffect, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor, type Editor } from "@tiptap/react"
import type { Content } from "@tiptap/core"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Selection } from "@tiptap/extensions"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableCell } from "@tiptap/extension-table-cell"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { LoomEmbed } from "@/components/tiptap-node/loom-embed-node/loom-embed-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { AlignCenterIcon } from "@/components/tiptap-icons/align-center-icon"
import { AlignJustifyIcon } from "@/components/tiptap-icons/align-justify-icon"
import { AlignLeftIcon } from "@/components/tiptap-icons/align-left-icon"
import { AlignRightIcon } from "@/components/tiptap-icons/align-right-icon"
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"
import { CircleCheck, Loader } from "lucide-react"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"

import content from "@/components/tiptap-templates/simple/data/content.json"

const MainToolbarContent = ({
  saveState,
  currentAlign,
  onAlignChange,
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  saveState: "idle" | "saving" | "saved" | "error"
  currentAlign: "left" | "center" | "right" | "justify"
  onAlignChange: (value: "left" | "center" | "right" | "justify") => void
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
}) => {
  const alignLabel =
    currentAlign === "center"
      ? "По центру"
      : currentAlign === "right"
        ? "Справа"
        : currentAlign === "justify"
          ? "По ширине"
          : "Слева"

  const CurrentAlignIcon =
    currentAlign === "center"
      ? AlignCenterIcon
      : currentAlign === "right"
        ? AlignRightIcon
        : currentAlign === "justify"
          ? AlignJustifyIcon
          : AlignLeftIcon

  return (
    <>
      <ToolbarGroup>
        <span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground" title={saveState === "saving" ? "Сохраняется" : "Сохранено"}>
          {saveState === "saving" ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : saveState === "error" ? (
            <Loader className="h-4 w-4 text-destructive" />
          ) : (
            <CircleCheck className="h-4 w-4 text-emerald-600" />
          )}
        </span>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
        />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" aria-label="Выравнивание текста">
              <CurrentAlignIcon className="tiptap-button-icon" />
              <span className="tiptap-button-text">{alignLabel}</span>
              <ChevronDownIcon className="tiptap-button-dropdown-small" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                data-active-state={currentAlign === "left" ? "on" : "off"}
                showTooltip={false}
                onClick={() => onAlignChange("left")}
                aria-label="Слева"
              >
                <AlignLeftIcon className="tiptap-button-icon" />
                <span className="tiptap-button-text">Слева</span>
              </Button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                data-active-state={currentAlign === "center" ? "on" : "off"}
                showTooltip={false}
                onClick={() => onAlignChange("center")}
                aria-label="По центру"
              >
                <AlignCenterIcon className="tiptap-button-icon" />
                <span className="tiptap-button-text">По центру</span>
              </Button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                data-active-state={currentAlign === "right" ? "on" : "off"}
                showTooltip={false}
                onClick={() => onAlignChange("right")}
                aria-label="Справа"
              >
                <AlignRightIcon className="tiptap-button-icon" />
                <span className="tiptap-button-text">Справа</span>
              </Button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                data-active-state={currentAlign === "justify" ? "on" : "off"}
                showTooltip={false}
                onClick={() => onAlignChange("justify")}
                aria-label="По ширине"
              >
                <AlignJustifyIcon className="tiptap-button-icon" />
                <span className="tiptap-button-text">По ширине</span>
              </Button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

type SimpleEditorProps = {
  content?: Content
  editable?: boolean
  className?: string
  saveState?: "idle" | "saving" | "saved" | "error"
  onUpdate?: (editor: Editor) => void
  onCreate?: (editor: Editor) => void
  uploadImage?: (
    file: File,
    onProgress?: ((event: { progress: number }) => void) | undefined,
    abortSignal?: AbortSignal
  ) => Promise<string>
}

export function SimpleEditor({
  content: contentProp,
  editable = true,
  className,
  saveState = "saved",
  onUpdate,
  onCreate,
  uploadImage,
}: SimpleEditorProps = {}) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
    "main"
  )
  const wrapperRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarBounds, setToolbarBounds] = useState<{ left: number; width: number } | null>(null)
  const onCreateRef = useRef(onCreate)
  const onUpdateRef = useRef(onUpdate)
  const uploadImageRef = useRef(uploadImage)

  useEffect(() => {
    onCreateRef.current = onCreate
  }, [onCreate])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    uploadImageRef.current = uploadImage
  }, [uploadImage])

  useEffect(() => {
    // Keep CRM editor in light mode even if OS prefers dark.
    document.documentElement.classList.remove("dark")
  }, [])

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      editorProps: {
        attributes: {
          autocomplete: "off",
          autocorrect: "off",
          autocapitalize: "off",
          "aria-label": "Main content area, start typing to enter text.",
          class: `simple-editor ${className ?? ""}`.trim(),
        },
      },
      onCreate: ({ editor: createdEditor }) => {
        onCreateRef.current?.(createdEditor)
      },
      onUpdate: ({ editor: updatedEditor }) => {
        onUpdateRef.current?.(updatedEditor)
      },
      extensions: [
        StarterKit.configure({
          horizontalRule: false,
          link: {
            openOnClick: false,
            enableClickSelection: true,
          },
        }),
        HorizontalRule,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        Image,
        LoomEmbed,
        Typography,
        Selection,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        ImageUploadNode.configure({
          accept: "image/*",
          maxSize: MAX_FILE_SIZE,
          limit: 3,
          upload: (file, onProgress, abortSignal) =>
            (uploadImageRef.current ?? handleImageUpload)(file, onProgress, abortSignal),
          onError: (error) => console.error("Upload failed:", error),
        }),
      ],
      content: contentProp ?? content,
    },
    []
  )

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editable, editor])

  useEffect(() => {
    if (!editor || typeof contentProp === "undefined") return
    editor.commands.setContent(contentProp, { emitUpdate: false })
  }, [contentProp, editor])

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })
  const currentAlign = editor?.isActive({ textAlign: "center" })
    ? "center"
    : editor?.isActive({ textAlign: "right" })
      ? "right"
      : editor?.isActive({ textAlign: "justify" })
        ? "justify"
        : "left"

  useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main")
    }
  }, [isMobile, mobileView])

  useEffect(() => {
    if (isMobile) return

    function syncToolbarBounds() {
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()
      setToolbarBounds({ left: rect.left, width: rect.width })
    }

    syncToolbarBounds()
    window.addEventListener("resize", syncToolbarBounds)
    window.addEventListener("scroll", syncToolbarBounds, { passive: true })

    return () => {
      window.removeEventListener("resize", syncToolbarBounds)
      window.removeEventListener("scroll", syncToolbarBounds)
    }
  }, [isMobile])

  return (
    <div ref={wrapperRef} className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={toolbarRef}
          style={{
            ...(isMobile
              ? {
                  bottom: `calc(100% - ${height - rect.y}px)`,
                }
              : toolbarBounds
                ? {
                    position: "fixed",
                    top: 0,
                    left: `${toolbarBounds.left}px`,
                    width: `${toolbarBounds.width}px`,
                    zIndex: 60,
                  }
                : {}),
          }}
        >
          {mobileView === "main" ? (
            <MainToolbarContent
              saveState={saveState}
              currentAlign={currentAlign}
              onAlignChange={(value) => editor?.chain().focus().setTextAlign(value).run()}
              onHighlighterClick={() => setMobileView("highlighter")}
              onLinkClick={() => setMobileView("link")}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              type={mobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}
