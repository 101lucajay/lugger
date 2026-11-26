"""Encrypts a finished HTML page behind a username + password login (for GitHub Pages).

    DEMO_USERNAME=... DEMO_PASSWORD=... python tools/protect_page.py in.html out.html

The page content is encrypted with AES-256-GCM; the key is derived from "username\\npassword"
with PBKDF2-SHA256 (310 000 rounds). The published file only contains the ciphertext and a
login form – without the right credentials the content cannot be read, not even in the source.
"""
import base64
import json
import os
import secrets
import sys
from hashlib import pbkdf2_hmac
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITERATIONS = 310_000

LOGIN_PAGE = """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Lugger · Anmelden</title>
<style>
:root { --bg: #06080c; --panel: #0d121a; --line: rgba(148,163,184,.16); --text: #e6edf7; --muted: #8b9ab3; --accent: #38bdf8; --red: #f43f5e; color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { display: grid; place-items: center; padding: 16px; color: var(--text); font: 14px/1.45 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(900px 500px at 70% -10%, rgba(56,189,248,.10), transparent 60%),
    linear-gradient(rgba(148,163,184,.04) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgba(148,163,184,.04) 1px, transparent 1px) 0 0 / 32px 32px, var(--bg); }
form { width: min(360px, 100%); background: linear-gradient(180deg, rgba(17,23,33,.95), rgba(11,15,22,.95)); border: 1px solid var(--line);
  border-radius: 18px; padding: 28px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.mark { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: linear-gradient(145deg, #38bdf8, #6366f1); box-shadow: 0 0 24px rgba(56,189,248,.45); }
.mark svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2; stroke-linejoin: round; }
h1 { margin: 0; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.sub { color: var(--muted); font-size: 12.5px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
input[type=text], input[type=password] { background: rgba(6,8,12,.7); border: 1px solid rgba(148,163,184,.24); border-radius: 10px; padding: 10px 12px; color: var(--text); font: inherit; }
input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(56,189,248,.18); }
.remember { flex-direction: row; align-items: center; gap: 8px; color: var(--text); font-size: 13px; }
button { margin-top: 4px; border: 0; border-radius: 10px; padding: 11px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; color: #03121c;
  background: linear-gradient(180deg, #4cc7fb, #1fa6e6); box-shadow: 0 0 20px rgba(56,189,248,.35); }
button:disabled { opacity: .6; cursor: wait; }
.err { color: var(--red); font-size: 13px; margin: 0; min-height: 1em; }
</style>
</head>
<body>
<form id="login" autocomplete="on">
  <div class="brand"><div class="mark"><svg viewBox="0 0 24 24"><path d="M3 20V10l5 3V10l5 3V10l5 3V4h3v16z"/></svg></div>
    <div><h1>Lugger</h1><div class="sub">Kommandozentrale · geschützter Zugang</div></div></div>
  <label>Benutzername<input type="text" id="u" name="username" autocomplete="username" required autofocus></label>
  <label>Passwort<input type="password" id="p" name="password" autocomplete="current-password" required></label>
  <label class="remember"><input type="checkbox" id="r"> Auf diesem Gerät angemeldet bleiben</label>
  <button type="submit" id="b">Anmelden</button>
  <p class="err" id="e" role="alert"></p>
</form>
<script>
const DATA = __DATA__;
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const store = { get() { try { return localStorage.getItem("lugger.key") || sessionStorage.getItem("lugger.key"); } catch (e) { return null; } },
  set(v, keep) { try { (keep ? localStorage : sessionStorage).setItem("lugger.key", v); } catch (e) {} },
  clear() { try { localStorage.removeItem("lugger.key"); sessionStorage.removeItem("lugger.key"); } catch (e) {} } };
async function decrypt(rawKey) {
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(DATA.iv) }, key, b64(DATA.ct)));
}
function show(html) { document.open(); document.write(html); document.close(); }
async function derive(user, pass) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(user.trim().toLowerCase() + "\\n" + pass), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(DATA.salt), iterations: DATA.it }, base, 256));
}
(async () => {
  const saved = store.get();
  if (saved) { let html = null; try { html = await decrypt(b64(saved)); } catch (e) { store.clear(); } if (html) show(html); }
})();
document.getElementById("login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById("b"), err = document.getElementById("e");
  btn.disabled = true; btn.textContent = "Prüfe …"; err.textContent = "";
  try {
    const raw = await derive(document.getElementById("u").value, document.getElementById("p").value);
    const html = await decrypt(raw);                     // throws on wrong credentials
    store.set(btoa(String.fromCharCode(...raw)), document.getElementById("r").checked);
    show(html);
  } catch (e) {
    err.textContent = "Benutzername oder Passwort stimmt nicht.";
    btn.disabled = false; btn.textContent = "Anmelden";
  }
});
</script>
</body>
</html>
"""


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    user = os.environ.get("DEMO_USERNAME", "").strip()
    password = os.environ.get("DEMO_PASSWORD", "")
    if not user or not password:
        sys.exit("DEMO_USERNAME und DEMO_PASSWORD fehlen – ohne Zugangsdaten wird nichts veröffentlicht.")
    if len(password) < 10:
        sys.exit("DEMO_PASSWORD ist zu kurz – bitte mindestens 10 Zeichen verwenden.")
    html = Path(sys.argv[1]).read_text(encoding="utf-8")
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    key = pbkdf2_hmac("sha256", (user.lower() + "\n" + password).encode(), salt, ITERATIONS, dklen=32)
    ct = AESGCM(key).encrypt(iv, html.encode("utf-8"), None)
    data = {"salt": base64.b64encode(salt).decode(), "iv": base64.b64encode(iv).decode(),
            "ct": base64.b64encode(ct).decode(), "it": ITERATIONS}
    out = Path(sys.argv[2])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(LOGIN_PAGE.replace("__DATA__", json.dumps(data)), encoding="utf-8")
    print(f"Geschützte Seite geschrieben: {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
