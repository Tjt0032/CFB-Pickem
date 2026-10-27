# Family CFB Pick'em

View-only standings for a family college football pick'em. The site is static files at the repo root (`index.html`, `style.css`, `app.js`, `data.json`). Every total, streak, and chart is computed in the browser from `data.json`. There is no build step and no server.

A pick is correct when it equals that game's `winner`. Games with `"winner": null` are upcoming and stay out of the standings.

## Update the board each week

1. Edit **`data.json` only** for weekly results. Do not hand-edit the HTML.
2. On each finished game, set `winner` to the winning team name (the `home` or `away` string, matched exactly). Leave `winner` as `null` if it has not been played.
3. Add new games as needed: `key`, `week`, `away`, `home`, `picks` for Tyler, Tatum, and Abigail, and `winner`.
4. Set `asOfWeek` to the week the recap should feature, and update `asOfNote` (it is shown in the footer).
5. Commit and push to `main`. Reload after the Pages deploy; the page fetches `data.json` on each visit.

`.github/workflows/pages.yml` publishes the repo root with GitHub's Pages actions (`configure-pages`, `upload-pages-artifact`, `deploy-pages`) on every push to `main`. The public URL is `https://tjt0032.github.io/CFB-Pickem/`.

Keep the player names Tyler, Tatum, and Abigail so their colors stay consistent. `weekDates` is a map of week number to `YYYY-MM-DD`. `conferences` lists the teams in each group the conference table uses.

## Preview locally

Opening `index.html` as a file can block the fetch. From the repo root:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
