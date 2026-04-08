"use client"

import { mergeAttributes, Node } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"

function getLoomEmbedSrc(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    const isLoomHost =
      url.hostname === "loom.com" || url.hostname === "www.loom.com"
    if (!isLoomHost) return null

    const [first, second] = url.pathname.split("/").filter(Boolean)
    if (first !== "share" || !second) return null

    const videoId = second
    if (!/^[a-zA-Z0-9_-]+$/.test(videoId)) return null

    const query = url.search || ""
    return `https://www.loom.com/embed/${videoId}${query}`
  } catch {
    return null
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    loomEmbed: {
      setLoomEmbed: (options: { src: string; originalUrl?: string }) => ReturnType
    }
  }
}

export const LoomEmbed = Node.create({
  name: "loomEmbed",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      originalUrl: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-loom-embed]",
      },
      {
        tag: "iframe[data-loom-embed]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const src = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : ""

    return [
      "div",
      mergeAttributes(
        {
          "data-loom-embed": "true",
          class: "loom-embed-wrapper",
        },
        HTMLAttributes
      ),
      [
        "iframe",
        {
          src,
          "data-loom-embed": "true",
          class: "loom-embed-iframe",
          allow:
            "fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          allowfullscreen: "true",
          webkitallowfullscreen: "true",
          mozallowfullscreen: "true",
          frameborder: "0",
          loading: "eager",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      ],
    ]
  },

  addCommands() {
    return {
      setLoomEmbed:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          })
        },
    }
  },

  addNodeView() {
    return ({ node }) => {
      const container = document.createElement("div")
      container.setAttribute("data-loom-embed", "true")
      container.className = "loom-embed-wrapper"
      container.setAttribute("contenteditable", "false")

      const iframe = document.createElement("iframe")
      iframe.setAttribute("data-loom-embed", "true")
      iframe.className = "loom-embed-iframe"
      iframe.setAttribute(
        "allow",
        "fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      )
      iframe.setAttribute("allowfullscreen", "true")
      iframe.setAttribute("webkitallowfullscreen", "true")
      iframe.setAttribute("mozallowfullscreen", "true")
      iframe.setAttribute("frameborder", "0")
      iframe.setAttribute("loading", "eager")
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")

      const src = typeof node.attrs.src === "string" ? node.attrs.src : ""
      iframe.setAttribute("src", src)

      container.appendChild(iframe)

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false
          const nextSrc =
            typeof updatedNode.attrs.src === "string"
              ? updatedNode.attrs.src
              : ""
          if (iframe.getAttribute("src") !== nextSrc) {
            iframe.setAttribute("src", nextSrc)
          }
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain")?.trim()
            if (!text || text.includes("\n")) return false

            const embedSrc = getLoomEmbedSrc(text)
            if (!embedSrc) return false

            const loomEmbedType = view.state.schema.nodes[this.name]
            if (!loomEmbedType) return false

            event.preventDefault()

            const loomNode = loomEmbedType.create({
              src: embedSrc,
              originalUrl: text,
            })

            let tr = view.state.tr.replaceSelectionWith(loomNode)
            const paragraphType = view.state.schema.nodes.paragraph

            if (paragraphType) {
              const insertPos = tr.selection.$to.pos
              tr = tr.insert(insertPos, paragraphType.create())
            }

            view.dispatch(tr.scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})
