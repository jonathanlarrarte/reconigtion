import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin'
const SECRET     = process.env.ADMIN_SECRET   || process.env.SECRET_KEY || 'dev-secret'

const PUBLIC = ['/login', '/portal', '/api/admin/login', '/_next', '/favicon.ico']

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (PUBLIC.some(p => path.startsWith(p))) return NextResponse.next()

  const cookie = req.cookies.get('admin_session')?.value
  const expected = createHmac('sha256', SECRET).update(`admin:${ADMIN_USER}`).digest('hex')

  if (cookie !== expected) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', path)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
