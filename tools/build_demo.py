"""Builds a self-contained live demo page (dashboard + bunker + simulated backend).

    python tools/build_demo.py [output.html] [--standalone]

--standalone writes a complete HTML document (doctype, head, body), e.g. for GitHub Pages.

The page runs entirely in the browser: app/static/mock.js replaces the REST API and
the WebSocket with a simulation, so no server or API keys are needed.
"""
import re
import sys
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "app" / "static"


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    standalone = "--standalone" in sys.argv
    out = Path(args[0] if args else "lugger-demo.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    html = (STATIC / "index.html").read_text()
    body = html[html.index("<body>") + len("<body>"):html.index("</body>")]
    body = re.sub(r'<script src="/static/[^"]+"></script>\s*', "", body)
    body = body.replace('href="/logout"', 'href="#overview"')
    css = (STATIC / "style.css").read_text()
    js = "\n".join((STATIC / n).read_text() for n in ("mock.js", "network.js", "app.js"))
    page = f"""<title>Lugger Kommandozentrale</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700;800&display=swap">
<style>
{css}
</style>
{body}
<script>
{js}
</script>
"""
    if standalone:
        cut = page.index("</style>") + len("</style>")
        head_part, body_part = page[:cut] + "\n", page[cut:]
        page = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                '<meta name="description" content="Live-Demo der Lugger-Agentenbasis mit simulierten Agenten.">\n'
                + head_part + '</head>\n<body>\n' + body_part + '</body>\n</html>\n')
    out.write_text(page)
    print(f"Demo geschrieben: {out} ({len(page) // 1024} KB)")


if __name__ == "__main__":
    main()
