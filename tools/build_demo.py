"""Builds a self-contained live demo page (dashboard + bunker + simulated backend).

    python tools/build_demo.py [output.html]

The page runs entirely in the browser: app/static/mock.js replaces the REST API and
the WebSocket with a simulation, so no server or API keys are needed.
"""
import re
import sys
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "app" / "static"


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "lugger-demo.html")
    html = (STATIC / "index.html").read_text()
    body = html[html.index("<body>") + len("<body>"):html.index("</body>")]
    body = re.sub(r'<script src="/static/[^"]+"></script>\s*', "", body)
    body = body.replace('href="/logout"', 'href="#overview"')
    css = (STATIC / "style.css").read_text()
    js = "\n".join((STATIC / n).read_text() for n in ("mock.js", "bunker.js", "app.js"))
    page = f"""<title>Lugger Zentrale</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
{css}
</style>
{body}
<script>
{js}
</script>
"""
    out.write_text(page)
    print(f"Demo geschrieben: {out} ({len(page) // 1024} KB)")


if __name__ == "__main__":
    main()
