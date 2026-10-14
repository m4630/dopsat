import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthorizationUrl, FLOW_COOKIE, getGoogleAuthConfig, randomToken, signValue } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = getGoogleAuthConfig();
  if (!config.configured) return NextResponse.redirect(new URL('/?auth=not-configured', request.url), 303);

  const state = randomToken();
  const nonce = randomToken();
  const flow = await signValue({ state, nonce, exp: Date.now() + 10 * 60 * 1000 }, config.sessionSecret);
  const response = NextResponse.redirect(buildGoogleAuthorizationUrl(config, state, nonce));
  response.cookies.set(FLOW_COOKIE, flow, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
