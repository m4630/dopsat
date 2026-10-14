import { NextRequest, NextResponse } from 'next/server';
import { createSessionValue, exchangeCode, FLOW_COOKIE, getGoogleAuthConfig, provisionGoogleUser, SESSION_COOKIE, verifyGoogleIdentity, verifyValue } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = getGoogleAuthConfig();
  const redirect = (reason: string) => NextResponse.redirect(new URL(`/?auth=${encodeURIComponent(reason)}`, request.url), 303);
  if (!config.configured) return redirect('not-configured');
  if (request.nextUrl.searchParams.get('error')) return redirect('cancelled');

  const code = request.nextUrl.searchParams.get('code');
  const returnedState = request.nextUrl.searchParams.get('state');
  const flow = await verifyValue<{ state: string; nonce: string; exp: number }>(request.cookies.get(FLOW_COOKIE)?.value, config.sessionSecret);
  if (!code || !returnedState || !flow || flow.exp < Date.now() || flow.state !== returnedState) return redirect('invalid-state');

  try {
    const idToken = await exchangeCode(code, config);
    const identity = await verifyGoogleIdentity(idToken, flow.nonce, config);
    const user = await provisionGoogleUser(identity, config);
    const response = NextResponse.redirect(new URL('/?auth=success', request.url), 303);
    response.cookies.set(SESSION_COOKIE, await createSessionValue(user, config.sessionSecret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    response.cookies.set(FLOW_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    const reason = error instanceof Error && error.message.includes('domain') ? 'wrong-domain' : 'verification-failed';
    return redirect(reason);
  }
}
