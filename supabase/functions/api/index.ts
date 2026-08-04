// Thin entrypoint — deliberately unconditional. Supabase's Edge Runtime
// almost certainly *imports* this module rather than executing it as a
// direct script, which means `import.meta.main` (the guard this file used
// to have, to avoid double-starting a server under `deno test`) evaluates
// to false in production. That guard silently prevented Deno.serve() from
// ever running on a real deployment — the function would boot successfully
// (all of app.ts's top-level code, including migrate(), ran fine) but never
// register a request handler, so Supabase's gateway had nothing to route
// to and fell back to its own generic 404. Confirmed via the deployed
// function's logs: "booted" with no errors, but every request still 404'd.
//
// Fix: app.ts now contains zero Deno.serve() logic (safe for tests to
// import directly), and THIS file — the actual deployed entrypoint — always
// calls Deno.serve(), no conditional.
import app from "./app.ts";

Deno.serve(app.fetch);
