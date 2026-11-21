"""Holt einmalig ein YouTube Refresh-Token (lokal am eigenen PC ausführen).

    python tools/youtube_token.py CLIENT_ID CLIENT_SECRET

Voraussetzung: OAuth-Client vom Typ "Desktop-App" in der Google Cloud Console,
YouTube Data API v3 aktiviert. Öffnet den Browser, du meldest dich mit dem
Kanal-Konto an, danach wird das Refresh-Token ausgegeben.
"""
import http.server
import json
import sys
import urllib.parse
import urllib.request
import webbrowser

PORT = 8765
REDIRECT = f"http://localhost:{PORT}"
SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    client_id, secret = sys.argv[1], sys.argv[2]
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": REDIRECT, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent"})
    code_box = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            code_box["code"] = q.get("code", [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("Fertig – du kannst dieses Fenster schließen.".encode())

        def log_message(self, *a):
            pass

    print("Öffne im Browser:\n", url)
    webbrowser.open(url)
    http.server.HTTPServer(("localhost", PORT), Handler).handle_request()
    data = urllib.parse.urlencode({"code": code_box.get("code", ""), "client_id": client_id,
                                   "client_secret": secret, "redirect_uri": REDIRECT,
                                   "grant_type": "authorization_code"}).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", data) as r:
        tok = json.load(r)
    print("\nYOUTUBE_REFRESH_TOKEN =", tok.get("refresh_token") or tok)


if __name__ == "__main__":
    main()
