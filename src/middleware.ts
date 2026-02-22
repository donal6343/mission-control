import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_USER = process.env.AUTH_USER || 'admin'
const AUTH_PASS = process.env.AUTH_PASS || 'trueshot2026'

export function middleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Mission Control"' }
    })
  }
  
  const [scheme, encoded] = authHeader.split(' ')
  
  if (scheme !== 'Basic' || !encoded) {
    return new NextResponse('Invalid authentication', { status: 401 })
  }
  
  const decoded = Buffer.from(encoded, 'base64').toString()
  const [user, pass] = decoded.split(':')
  
  if (user !== AUTH_USER || pass !== AUTH_PASS) {
    return new NextResponse('Invalid credentials', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Mission Control"' }
    })
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)']
}
