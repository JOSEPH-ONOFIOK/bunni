import { NextRequest, NextResponse } from "next/server";
import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  authorizeUrl,
  newState,
  newVerifier,
  xConfig,
} from "@/lib/x-oauth";

export async function GET(req: NextRequest) {
  const config = xConfig(req.nextUrl.origin);
  if (!config) {
    return NextResponse.redirect(
      new URL("/join?x=unconfigured", req.nextUrl.origin),
    );
  }

  const state = newState();
  const verifier = newVerifier();

  const res = NextResponse.redirect(authorizeUrl(config, state, verifier));

  // Short-lived and httpOnly: these only need to survive the round trip to
  // X and back, and they are what stops a forged callback from landing.
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  } as const;

  res.cookies.set(STATE_COOKIE, state, options);
  res.cookies.set(VERIFIER_COOKIE, verifier, options);

  return res;
}
