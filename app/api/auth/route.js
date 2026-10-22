import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SEC,
  createSessionToken,
  getConfiguredPin,
  getSecretKey,
  isRequestAuthenticated,
  verifyPinInput
} from '../../../lib/auth';

export async function GET(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const refreshedToken = createSessionToken();
  const response = NextResponse.json({
    authenticated: true,
    token: refreshedToken,
    expiresInDays: 90
  });
  response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SEC
  });
  return response;
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'logout') {
      const res = NextResponse.json({ ok: true });
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }

    if (!getConfiguredPin() || getSecretKey().length < 16) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Configurá AGY_POCKET_PIN y AGY_POCKET_SECRET en tus variables de entorno (.env.local / Vercel).'
        },
        { status: 500 }
      );
    }

    if (!verifyPinInput(body.pin)) {
      return NextResponse.json(
        { ok: false, error: 'PIN incorrecto.' },
        { status: 401 }
      );
    }

    const token = createSessionToken();
    const res = NextResponse.json({
      ok: true,
      token,
      expiresInDays: 90
    });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SEC
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Error de autenticación' },
      { status: 400 }
    );
  }
}
