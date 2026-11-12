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
- `greenhouse/`: Greenhouse Planner. 10x10 layout editor with crop effects, growth cycle time and
  mutation spots. The crop and mutation facts live in `greenhouse/data.js`, copied by hand from the
  wiki's Greenhouse and Mutations pages, so update that file when Hypixel changes mutations.
- `shards/`: Attribute Shards. Level tracker and fusion planner (cheapest time to each shard).
- `config.js`: site settings, including the shared Hypixel API key every visitor uses. Development keys
  expire, so edit this file (on GitHub: Edit button) whenever the key changes.
- `shared/`: the shared stylesheet (`site.css`) and helpers (`sb.js`: SkyBlock calendar, formatting).
- `icons/`: item icons for the Ironman planner's picture tree, plus `index.json` listing them.
  Fetched from sky.coflnet.com with `python scripts/fetch_icons.py NotEnoughUpdates-REPO-master.zip`
  (existing icons are skipped, so re-running only grabs new items).
- `data/`: `minions.json` and `forge.json`, extracted from the NEU item repo. Re-extract them when new
  minions or forge recipes are added: download the NEU repo zip, then run
  `python scripts/extract_neu.py NotEnoughUpdates-REPO-master.zip data`.
- `data/shards.json` and `data/fusion.json`: shard list (NEU) plus effects, hunt rates and fusion
  recipes from [SkyShards](https://github.com/Campionnn/SkyShards) (MIT, see `data/SKYSHARDS-LICENSE.txt`).
  Refresh with `python scripts/extract_shards.py`, which also downloads any new shard icons.

It's a static site with no build step, hosted on GitHub Pages with the custom domain in `CNAME`.

## Run locally

```bash
python -m http.server 8767
```
Then open http://localhost:8767
