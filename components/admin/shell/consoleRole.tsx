'use client'

import { createContext, useContext } from 'react'
import type { ConsoleRole } from './adminNav'

/** Set by AdminShell: 'admin', or 'blog_editor' for blog writers (they only get the blog pages). */
export const ConsoleRoleContext = createContext<ConsoleRole>('admin')

export const useConsoleRole = () => useContext(ConsoleRoleContext)
