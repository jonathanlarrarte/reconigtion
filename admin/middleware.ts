import { NextRequest, NextResponse } from 'next/server'

const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin'
const SECRET     = process.env.ADMIN_SECRET   || process.env.SECRET_KEY || 'dev-secret'

const PUBLIC = ['/login', '/portal', '/api/admin/login', '/_next', '/favicon.ico']

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (PUBLIC.some(p => path.startsWith(p))) return NextResponse.next()

  const cookie = req.cookies.get('admin_session')?.value
  if (!cookie) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', path)
    return NextResponse.redirect(login)
  }

  const expected = await hmacHex(SECRET, `admin:${ADMIN_USER}`)
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
