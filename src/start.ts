import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Baseline security headers on every response. The CSP allows the app's own
 * bundles, Google Fonts, Supabase (API + storage) and inline styles (required
 * by Tailwind/KaTeX), and blocks framing, plugins and form hijacking.
 */
const SUPABASE_ORIGIN = "https://*.supabase.co";
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.gpteng.co`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: https:`,
  `media-src 'self' blob: ${SUPABASE_ORIGIN}`,
  `connect-src 'self' blob: ${SUPABASE_ORIGIN} wss://*.supabase.co https://*.lovable.app https://*.lovable.dev`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  const headers = response?.headers;
  if (!headers) return result;
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  );
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  return result;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeaders, errorMiddleware],
}));

