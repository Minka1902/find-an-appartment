"use client";

/**
 * Last-resort boundary, for a failure in the root layout itself.
 *
 * This file *replaces* the root layout when active, so it must render its own
 * `<html>` and `<body>` — and, critically, it does not receive `globals.css`.
 * That means no Tailwind classes and no theme tokens: every colour here is
 * spelled out, and dark mode is handled by an inline `<style>` block rather
 * than the app's usual `@theme` variables.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        {/* React hoists this into <head>; global-error has no metadata export. */}
        <title>Something went wrong — Where To Live</title>

        <style>{`
          :root { color-scheme: light; --bg: #ffffff; --fg: #16191d; --muted: #5c6672; --line: #dfe3e8; }
          @media (prefers-color-scheme: dark) {
            :root { color-scheme: dark; --bg: #101216; --fg: #eef1f5; --muted: #9aa5b1; --line: #2a2f38; }
          }
          body {
            margin: 0; min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
            background: var(--bg); color: var(--fg);
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          .wrap { max-width: 26rem; padding: 2rem 1.5rem; text-align: center; }
          h1 { font-size: 1.05rem; margin: 0 0 .5rem; }
          p { font-size: .8rem; line-height: 1.6; color: var(--muted); margin: 0 0 1.25rem; }
          button {
            font: inherit; font-size: .82rem; font-weight: 500;
            padding: .6rem 1rem; border-radius: .5rem;
            border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer;
          }
          button:hover { border-color: currentColor; }
        `}</style>

        <div className="wrap">
          <h1>Where To Live couldn&apos;t start</h1>
          <p>
            The app failed before it could render anything. Your household is
            saved in this browser and will still be there once it recovers.
            {error.digest ? ` Reference: ${error.digest}.` : ""}
          </p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
