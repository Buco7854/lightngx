package sites

// defaultPage is the maintenance page served when no custom page is
// configured via LN_MAINTENANCE_PAGE. It auto-detects the visitor's language
// and follows their light/dark preference (and the app's stored theme when
// on the same origin). It carries no branding.
const defaultPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Maintenance</title>
<style>
  :root {
    --bg: #f5f6f8; --panel: #ffffff; --border: #e2e5ea;
    --fg: #1c2128; --dim: #6a7280; --accent: #009639;
    color-scheme: light dark;
  }
  :root[data-theme="dark"] {
    --bg: #0d1512; --panel: #141a17; --border: #26302a;
    --fg: #e6ebe7; --dim: #8ba093; --accent: #26b356;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0d1512; --panel: #141a17; --border: #26302a;
      --fg: #e6ebe7; --dim: #8ba093; --accent: #26b356;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 1.5rem; background: var(--bg); color: var(--fg);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    max-width: 27rem; width: 100%; padding: 2.75rem 2rem 2.5rem; text-align: center;
    background: var(--panel); border: 1px solid var(--border); border-radius: 16px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.06);
  }
  .icon {
    width: 60px; height: 60px; margin: 0 auto 1.25rem; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
  }
  h1 { font-size: 1.3rem; font-weight: 650; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
  p { color: var(--dim); font-size: 0.95rem; line-height: 1.55; margin: 0; }
</style>
</head>
<body>
  <main class="card">
    <div class="icon" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    </div>
    <h1 id="head">We&rsquo;ll be right back</h1>
    <p id="msg">This site is temporarily down for maintenance. Please try again shortly.</p>
  </main>
  <script>
    (function () {
      var T = {
        en: ["We’ll be right back", "This site is temporarily down for maintenance. Please try again shortly.", "Maintenance"],
        fr: ["De retour dans un instant", "Ce site est temporairement en maintenance. Merci de réessayer dans quelques instants.", "Maintenance"],
        es: ["Volvemos enseguida", "Este sitio está temporalmente en mantenimiento. Inténtalo de nuevo en unos minutos.", "Mantenimiento"],
        de: ["Gleich wieder da", "Diese Seite wird gerade gewartet. Bitte versuchen Sie es in Kürze erneut.", "Wartung"],
        it: ["Torniamo subito", "Il sito è temporaneamente in manutenzione. Riprova tra qualche minuto.", "Manutenzione"],
        pt: ["Voltamos já", "Este site está temporariamente em manutenção. Tente novamente em breve.", "Manutenção"],
        nl: ["Zo terug", "Deze site is tijdelijk in onderhoud. Probeer het over enkele ogenblikken opnieuw.", "Onderhoud"],
        pl: ["Zaraz wracamy", "Ta strona jest tymczasowo w trakcie konserwacji. Spróbuj ponownie za chwilę.", "Konserwacja"],
        ru: ["Скоро вернёмся", "Сайт временно на техническом обслуживании. Повторите попытку позже.", "Обслуживание"],
        ja: ["まもなく再開します", "このサイトは現在メンテナンス中です。しばらくしてから再度お試しください。", "メンテナンス"],
        zh: ["稍后回来", "本站正在维护，请稍后再试。", "维护中"]
      };
      try {
        var pref = localStorage.getItem("ln_theme");
        if (pref === "dark" || pref === "light") document.documentElement.dataset.theme = pref;
      } catch (e) {}
      var langs = (navigator.languages || [navigator.language || "en"]);
      var t = null;
      for (var i = 0; i < langs.length && !t; i++) {
        var code = (langs[i] || "").slice(0, 2).toLowerCase();
        if (T[code]) t = T[code], document.documentElement.lang = code;
      }
      t = t || T.en;
      document.getElementById("head").textContent = t[0];
      document.getElementById("msg").textContent = t[1];
      document.title = t[2];
    })();
  </script>
</body>
</html>
`
