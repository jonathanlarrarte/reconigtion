'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './sidebar'

// Pages that don't show the admin sidebar (full-screen or public pages)
const NO_SIDEBAR_PATHS = ['/widget', '/login', '/portal']

export default function SidebarGuard() {
  const path = usePathname()
  const hide = NO_SIDEBAR_PATHS.some(p => path === p || path.startsWith(p + '/'))
  if (hide) return null
  return <Sidebar />
}
