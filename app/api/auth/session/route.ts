import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthConfig, readSessionValue, SESSION_COOKIE } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = getGoogleAuthConfig();
  if (!config.configured) return NextResponse.json({ user: null }, { headers: { 'cache-control': 'no-store' } });
  const user = await readSessionValue(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  return NextResponse.json({ user }, { headers: { 'cache-control': 'no-store' } });
}
