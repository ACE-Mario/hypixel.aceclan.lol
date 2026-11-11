# hypixel.aceclan.lol

ACE Clan's Hypixel SkyBlock tools. This is a separate site from the main clan site (aceclan.lol).

- `index.html`: landing page listing the tools
- `ironman/`: Ironman Craft Planner. Breaks any item down to raw materials using recipes from the
  [NotEnoughUpdates item repo](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO).
  Other tools link into it with `ironman/?item=ITEM_ID&qty=N`.
- `minions/`: Minion Planner. Output per day, time until storage is full, and upgrade costs.
- `forge/`: Forge Queue Planner. Spreads forges across your slots and shows when each one is ready.
- `events/`: Event Timers. Countdowns worked out from the SkyBlock calendar.
- `mayor/`: Mayor Tracker. Current mayor, minister and election votes from the public Hypixel API.
- `shared/`: the shared stylesheet (`site.css`) and helpers (`sb.js`: SkyBlock calendar, formatting).
- `data/`: `minions.json` and `forge.json`, extracted from the NEU item repo. Re-extract them when new
  minions or forge recipes are added: download the NEU repo zip, then run
  `python scripts/extract_neu.py NotEnoughUpdates-REPO-master.zip data`.

It's a static site with no build step, hosted on GitHub Pages with the custom domain in `CNAME`.

## Run locally

```bash
python -m http.server 8767
```
Then open http://localhost:8767
