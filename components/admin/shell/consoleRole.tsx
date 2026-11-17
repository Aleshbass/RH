'use client'

import { createContext, useContext } from 'react'
import { FULL_ACCESS, type AdminAccess, type ConsoleRole } from './adminNav'

/** Set by AdminShell: 'admin', or 'blog_editor' for blog writers (they only get the blog pages). */
export const ConsoleRoleContext = createContext<ConsoleRole>('admin')

export const useConsoleRole = () => useContext(ConsoleRoleContext)

/** What this admin may open (AdminShell): everything, or the pages a full admin ticked. */
export const AdminAccessContext = createContext<AdminAccess>(FULL_ACCESS)

export const useAdminAccess = () => useContext(AdminAccessContext)
