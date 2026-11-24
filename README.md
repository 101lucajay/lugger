# 🎬 Lugger – Agenten-Zentrale für automatische Kurzvideos

Lugger findet selbstständig Videoideen in einer angesagten Branche, schreibt recherchierte Skripte,
spricht sie ein, schneidet daraus vertikale Informationsvideos (1080×1920, 9:16) mit animierten
Untertiteln und lädt sie nach deiner Freigabe auf **TikTok, Instagram Reels und YouTube Shorts** hoch.

Voreingestellte Branche: **Künstliche Intelligenz & Zukunftstechnologien** (im Dashboard änderbar).

## Das Dashboard

Die Startseite ist die **Produktionsstraße**: eine große Seitenansicht wie in einem Autowerk, nur dass hier Videos
gebaut werden. Jedes Video fährt als Werkstück auf dem Fließband von Station zu Station und wird sichtbar
zusammengesetzt: Idee → Plan → Skript → Tonspur → Filmmaterial → fertiges Video → Prüfung → Versand.
Hinter dem Band arbeiten die Agenten (im Anzug, mit Sonnenbrille und Headset, Krawatte in Abteilungsfarbe).
Am Ende liegt die Nebenhalle mit dem Automations-Werk, wo ein Roboter und zwei Industrie-Roboterarme deine
Automatisierungen ausführen.

- **Wischen/Ziehen** nach links und rechts (oder Trackpad, Pfeiltasten, die Pfeil-Knöpfe) bewegt dich die Straße entlang.
  Die Höhe ist fest, es gibt kein Zoomen oder Drehen.
- **Stations-Leiste** unter der Straße: springt direkt zu einer Station und zeigt deren Status.
- **Live folgen**: Die Ansicht fährt automatisch zur Station, an der gerade gearbeitet wird.
- Klick auf einen Agenten zeigt seine Details, Klick auf ein Werkstück öffnet das Video, und ein Klick auf die
  Prüf-Station öffnet das nächste Video, das auf deine Freigabe wartet.

Darunter: Kennzahlen, offene Freigaben, die Crew, Automations-Läufe und ein Live-Feed.

Die **Seitenleiste** ist ausgeklappt (einklappbar) und in Untermenüs gegliedert:

- **Agentenbasis** (Start)
- **Automatisierungen**: Übersicht, Verlauf
- **Faceless-Kanal**: Videos, Ideen, Zeitplan & Freigabe, Statistik
- **Admin-Center**: Agenten, Protokoll, Einstellungen

## Admin-Center

Unter **Admin-Center → Agenten** verwaltest du jeden Agenten: aktiv/pausiert, sofort ausführen, neu starten,
Kennzahlen (erledigt, Fehler, Ø Dauer, letzte Aktivität) und die letzten Protokollzeilen. Für Trend-Scout und
Skript-Autor kannst du ein eigenes KI-Modell und zusätzliche Anweisungen festlegen (z. B. „Immer mit einer
überraschenden Zahl beginnen“). Außerdem: alle Agenten pausieren/starten und fehlgeschlagene Videos neu starten.

## Automatisierungen (allgemein)

Unabhängig vom Videokanal baust du eigene Abläufe nach dem Muster **Auslöser → Schritte**:

| Auslöser | Schritte |
|---|---|
| Manuell, Zeitplan (Uhrzeiten + Wochentage), Intervall, Webhook (eigene URL), Ereignis aus der Fabrik (Video gestartet / wartet auf Freigabe / freigegeben / veröffentlicht / Fehler, neue Ideen) | HTTP-Anfrage, Claude fragen (optional mit Websuche), Discord, Slack, Telegram, Bedingung, Warten, Videoidee anlegen, Video produzieren, Agent starten, Autopilot schalten, Protokoll-Eintrag |

Mit Variablen nutzt du Ergebnisse weiter, z. B. `{{trigger.data.title}}`, `{{steps.1.output}}`,
`{{steps.1.output.status}}`, `{{date}}`, `{{time}}` oder `{{stats.published}}`. Vorlagen (Discord-Post bei neuem Video,
KI-News am Morgen, Website-Monitor, Webhook → Idee, Fehler-Alarm, Wochenbericht) helfen beim Start. Jeder Lauf
wird mit allen Schritt-Ergebnissen gespeichert. Webhooks erreichst du unter `/hooks/<token>` (GET oder POST mit JSON).

**Demo ohne Server:** `python tools/build_demo.py demo.html` erzeugt eine eigenständige Seite mit simulierten
Agenten und Automationen.

## Die Agentenstation

| Agent | Aufgabe |
|---|---|
| 🔭 **Trend-Scout** | Durchsucht Google News und das Web (Claude-Websuche) nach aktuellen Themen und bewertet das virale Potenzial. Er hält immer einen Vorrat an Ideen bereit. |
| 🎬 **Produktionsleiter** | Startet nach Zeitplan (Standard: 1 Video/Tag um 17:00) eine Produktion mit der besten Idee. |
| ✍️ **Skript-Autor** | Recherchiert die Fakten und schreibt ein 45–60-Sekunden-Skript mit Hook, Szenen, Titel und Hashtags. |
| 🎙️ **Sprecher** | Spricht das Skript ein (ElevenLabs, OpenAI oder kostenlos mit Edge-TTS), samt Zeitstempeln für jedes Wort. |
| 🖼️ **Bild-Redakteur** | Sucht pro Szene ein passendes Hochkant-Stockvideo (Pexels). Ohne Key generiert er animierte Hintergründe. |
| 🎞️ **Cutter** | Rendert mit ffmpeg: Szenen, leichter Zoom, Karaoke-Untertitel, Keyword-Einblendungen, Fortschrittsbalken und Musik. Danach macht er eine Qualitätskontrolle. |
| 🚀 **Publisher** | Lädt freigegebene Videos hoch, entweder über die offiziellen APIs oder über upload-post.com. |

Alle Agenten arbeiten parallel am Fließband. Im Dashboard siehst du **live**, was jeder gerade macht:
Status, Fortschritt, aktuelles Video und das Live-Protokoll.

**Steuerung im Dashboard:** Autopilot an/aus, jeden Agenten einzeln pausieren oder starten,
„Jetzt ausführen“, Produktion mit eigenem Thema starten, Videos ansehen, Titel und Hashtags bearbeiten,
**freigeben oder ablehnen**, neu rendern bzw. neu einsprechen, alle Einstellungen und API-Keys.

## Start (Docker – empfohlen)

```bash
git clone <dieses-repo> lugger && cd lugger
cp .env.example .env        # Passwort + Keys eintragen (oder später im Dashboard)
docker compose up -d --build
```

Danach das Dashboard öffnen: **http://localhost:8000** (auf einem Server: `http://SERVER-IP:8000`).
Videos, Datenbank und Einstellungen liegen in `./data`.

> Auf einem öffentlichen Server unbedingt `DASHBOARD_PASSWORD` setzen und am besten einen
> Reverse-Proxy mit HTTPS davorschalten (z. B. Caddy: `caddy reverse-proxy --from deine-domain.de --to localhost:8000`).

### Ohne Docker

```bash
sudo apt install ffmpeg fonts-dejavu-core     # macOS: brew install ffmpeg
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Was du brauchst

| Dienst | Wofür | Kosten | Pflicht? |
|---|---|---|---|
| [Anthropic (Claude)](https://console.anthropic.com) | Ideen, Recherche, Skripte | ca. 0,05–0,30 € pro Video | **ja** (ohne Key: nur Demo-Skripte) |
| [Pexels](https://www.pexels.com/api/) | Stock-Videos | kostenlos | empfohlen |
| [ElevenLabs](https://elevenlabs.io) | sehr natürliche Stimme | ab ca. 5 $/Monat | optional |
| OpenAI | Alternative Stimme | Centbeträge | optional |
| Edge-TTS | kostenlose Stimme | 0 € | Standard ohne andere Keys |
| [upload-post.com](https://upload-post.com) | Upload auf alle 3 Plattformen | Free-Tier bis ca. 20 $/Monat | eine der beiden Upload-Varianten |

**Hintergrundmusik:** Lege lizenzfreie MP3s (z. B. aus der YouTube Audio Library) in `data/music/`.
Der Cutter wählt pro Video zufällig einen Track aus.

## Upload einrichten

Im Dashboard unter **Einstellungen → Upload** wählst du pro Plattform: `off`, `direct` (offizielle API)
oder `uploadpost`.

### Variante A: upload-post.com (schnellster Weg)
1. Account anlegen und TikTok, Instagram und YouTube im Dashboard von upload-post verbinden.
2. Den API-Key und den Profilnamen (User) in Lugger eintragen und alle Plattformen auf `uploadpost` stellen.

### Variante B: offizielle APIs

**YouTube**
1. In der [Google Cloud Console](https://console.cloud.google.com) ein Projekt anlegen und die **YouTube Data API v3** aktivieren.
2. Den OAuth-Zustimmungsbildschirm einrichten (extern, eigenes Konto als Testnutzer eintragen, später „In Produktion“ setzen, damit das Token nicht nach 7 Tagen abläuft).
3. Einen OAuth-Client vom Typ **Desktop-App** erstellen.
4. Am eigenen PC `python tools/youtube_token.py CLIENT_ID CLIENT_SECRET` ausführen und mit dem Kanal-Konto anmelden.
5. Client-ID, Client-Secret und Refresh-Token in Lugger eintragen und `youtube_mode = direct` setzen.

**Instagram Reels**
1. Instagram als **Business- oder Creator-Account** einrichten.
2. Unter [developers.facebook.com](https://developers.facebook.com) eine App anlegen und das Produkt „Instagram API“ mit der Berechtigung `instagram_content_publish` hinzufügen.
3. Ein langlebiges Access-Token und die Instagram-User-ID erzeugen und in Lugger eintragen.
4. `instagram_mode = direct` setzen. Lugger nutzt den direkten (resumable) Upload, eine öffentliche URL ist nicht nötig.

**TikTok**
1. Unter [developers.tiktok.com](https://developers.tiktok.com) eine App mit **Content Posting API** (Direct Post) und dem Scope `video.publish` anlegen.
2. Per OAuth ein Refresh-Token holen und Client-Key, Client-Secret und Refresh-Token eintragen.
3. ⚠️ Solange TikTok die App nicht geprüft hat (Audit dauert oft Wochen), sind Posts **nur privat** sichtbar (`SELF_ONLY`). Bis dahin besser TikTok über upload-post.com laden.

## Ablauf & Freigabe

1. Bei aktivem Autopilot hält der Trend-Scout immer mindestens 6 Ideen bereit.
2. Zu den Produktionszeiten startet der Produktionsleiter ein Video.
3. Skript, Stimme, Material und Schnitt laufen vollautomatisch, in rund 1–3 Minuten.
4. Das fertige Video landet unter **Videos → „Wartet auf Freigabe“**. Dort kannst du es ansehen, Texte anpassen und auf **„Freigeben & veröffentlichen“** klicken.
5. Der Publisher lädt es hoch und zeigt die Links an. Ist ein Upload fehlgeschlagen, wiederholt „Erneut versuchen“ nur die fehlgeschlagenen Plattformen.

Freigabe abschalten (vollautomatischer Betrieb): Einstellungen → „Vor dem Hochladen Freigabe verlangen“.

## Projektstruktur

```
app/
  main.py              FastAPI-Server, REST-API, WebSocket für Live-Updates
  agents/              Die Agenten (je ein eigener asyncio-Loop)
  publishers/          YouTube, TikTok, Instagram, upload-post.com
  llm.py               Claude-Anbindung (strukturierte Antworten + Websuche)
  static/              Dashboard (HTML/CSS/JS, kein Build-Schritt)
tools/youtube_token.py Hilfsskript für das YouTube Refresh-Token
data/                  Datenbank, Videos, Musik (Docker-Volume)
```

## Hinweise

- KI-generierte Videos sollten auf den Plattformen als solche gekennzeichnet werden. YouTube-Uploads setzen dafür automatisch `containsSyntheticMedia`. Bei TikTok und Instagram ggf. das KI-Label in der App setzen.
- Die Skripte werden mit Quellen recherchiert. Prüfe vor der Freigabe trotzdem kurz die Fakten, denn das ist der Sinn des Freigabe-Schritts.
- API-Keys, die du im Dashboard einträgst, werden in `data/lugger.db` gespeichert. Schütze den Ordner und das Dashboard-Passwort entsprechend.
