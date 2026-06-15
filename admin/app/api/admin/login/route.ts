import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? 'faceid2024'
const SECRET     = process.env.ADMIN_SECRET   || process.env.SECRET_KEY || 'dev-secret'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    await new Promise(r => setTimeout(r, 500)) // evitar timing attacks
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  const token = createHmac('sha256', SECRET).update(`admin:${ADMIN_USER}`).digest('hex')

  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 horas
    path: '/',
  })
  return res
}
