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
- `talismans/`: Talisman Tracker. Magical Power, missing accessories (only the next tier in each upgrade
  line by default) and how to get each one. Reads the Accessory Bag when logged in.
- `museum/`: Museum Tracker. Donations from the Museum API, XP per item, and each item's raw materials
  priced live from the Bazaar so the cheapest donations are easy to find.
- `uniques/`: Unique Minions. Unique minion crafts (whole co-op), minion slots and the next threshold,
  and the cheapest tiers to craft next. Each tier's Plan button opens it in the Minion Planner.
- `hotm/` and `hotf/`: Heart of the Mountain / Heart of the Forest planners. Both use `shared/tree.js`
  with preset builds defined in each page's `app.js`; they read your tree and powder from the profile.
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

- `data/accessories.json`: every accessory (Hypixel items API) with upgrade lines and recipes (NEU).
  Refresh with `python scripts/extract_accessories.py` when new accessories come out.

- `data/museum.json`: museum items, XP and armour sets (Hypixel items API) with recipes broken down to
  raw materials (NEU). Refresh with `python scripts/extract_museum.py NotEnoughUpdates-REPO-master.zip`.

- `data/hotm.json` and `data/hotf.json`: tree layouts, costs and stats (NEU). Heart of the Forest costs
  aren't in NEU, so `scripts/extract_trees.py` fills them in from the wiki (update `HOTF_EXP` there if
  they change). Refresh with `python scripts/extract_trees.py NotEnoughUpdates-REPO-master.zip`.

It's a static site with no build step, hosted on GitHub Pages with the custom domain in `CNAME`.

## Run locally

```bash
python -m http.server 8767
```
Then open http://localhost:8767
