import { Node, mergeAttributes } from '@tiptap/core'

/**
 * A picture in a campaign message: full width, with words shown when it doesn't load (alt) and
 * an optional link it opens. Saved as { type: "image", attrs: { src, alt, href } }, which
 * lib/email/richText.ts draws in the email. Only https pictures are taken in (no pasted data:
 * images, which email apps block).
 */
export const EmailImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      href: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-href') || element.closest('a')?.getAttribute('href') || null,
        renderHTML: (attributes: { href?: string | null }) =>
          attributes.href ? { 'data-href': attributes.href, title: `Opens ${attributes.href}` } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src^="https://"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { draggable: 'false' })]
  },
})
