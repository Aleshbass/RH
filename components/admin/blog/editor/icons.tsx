'use client'

import * as React from 'react'
import {
  faArrowPointer,
  faBold,
  faFont,
  faGripVertical,
  faHeading,
  faItalic,
  faListOl,
  faListUl,
  faRotateRight,
  faStrikethrough,
  faTable,
  faUnderline,
  faLinkSlash,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { faYoutube } from '@fortawesome/free-brands-svg-icons'
import { Icon, type IconComponent, type IconProps } from '@/components/icons'

/** Editor-only glyphs (text formatting, drag grip) on top of the platform icon set. */
function make(name: string, icon: IconDefinition): IconComponent {
  const Component = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => <Icon ref={ref} icon={icon} {...props} />)
  Component.displayName = name
  return Component
}

export const Bold = make('Bold', faBold)
export const Italic = make('Italic', faItalic)
export const Underline = make('Underline', faUnderline)
export const Strikethrough = make('Strikethrough', faStrikethrough)
export const Heading = make('Heading', faHeading)
export const Type = make('Type', faFont)
export const GripVertical = make('GripVertical', faGripVertical)
export const BulletList = make('BulletList', faListUl)
export const NumberedList = make('NumberedList', faListOl)
export const Table2 = make('Table2', faTable)
export const MousePointerClick = make('MousePointerClick', faArrowPointer)
export const Redo2 = make('Redo2', faRotateRight)
export const Unlink = make('Unlink', faLinkSlash)
export const YouTube = make('YouTube', faYoutube)

export {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ImageIcon,
  Info,
  Layers,
  Lightbulb,
  Link,
  List,
  ListChecks,
  Minus,
  PlayCircle,
  Quote,
  Undo2,
  type IconComponent,
} from '@/components/icons'
