import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options: CookieOptions }

const PROTECTED_PREFIXES = ['/app', '/onboarding']
const AUTH_PAGES = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if (!user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  if (user && AUTH_PAGES.includes(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/app/:path*', '/onboarding/:path*', '/login', '/signup'],
}
