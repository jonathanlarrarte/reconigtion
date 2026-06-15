import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import SidebarGuard from '@/components/sidebar-guard'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'FaceID Admin',
  description: 'Panel de administración FaceID SaaS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={geist.variable}>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <div className="flex min-h-screen">
          <SidebarGuard />
          {/* p-8 is needed for admin pages; widget/login/portal handle their own layout */}
          <main className="flex-1 p-8 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  )
}
