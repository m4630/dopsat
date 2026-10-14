import { NextResponse } from 'next/server';
import { getGoogleAuthConfig } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getGoogleAuthConfig();
  return NextResponse.json({
    configured: config.configured,
    schoolDomain: config.schoolDomain || null,
    missing: config.missing,
  }, { headers: { 'cache-control': 'no-store' } });
}
