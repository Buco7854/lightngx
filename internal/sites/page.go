package sites

// defaultPage is the maintenance page served when no custom page is
// configured via LN_MAINTENANCE_PAGE.
const defaultPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Maintenance</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f5f6f8; color: #1c2128;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #14171c; color: #e4e8ee; }
    .card { background: #1c2027 !important; border-color: #313845 !important; }
    p { color: #8b94a3 !important; }
  }
  .card {
    max-width: 26rem; margin: 1rem; padding: 2.5rem 2rem; text-align: center;
    background: #fff; border: 1px solid #d8dce2; border-radius: 14px;
  }
  .gear { font-size: 3rem; line-height: 1; }
  h1 { font-size: 1.3rem; margin: 1rem 0 0.25rem; }
  h2 { font-size: 1rem; font-weight: 500; margin: 0.75rem 0 0; }
  p { color: #6a7280; font-size: 0.92rem; line-height: 1.5; margin: 0.5rem 0 0; }
</style>
</head>
<body>
  <main class="card">
    <div class="gear">🔧</div>
    <h1>We&rsquo;ll be right back</h1>
    <p>This site is temporarily down for maintenance. Please try again in a few minutes.</p>
    <h2>De retour dans un instant</h2>
    <p>Ce site est temporairement en maintenance. Merci de r&eacute;essayer dans quelques minutes.</p>
  </main>
</body>
</html>
`
