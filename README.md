# hypixel.aceclan.lol

ACE Clan's Hypixel SkyBlock tools. This is a separate site from the main clan site (aceclan.lol).

- `index.html`: landing page listing the tools
- `ironman/`: Ironman Craft Planner. Breaks any item down to raw materials using recipes from the
  [NotEnoughUpdates item repo](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)

It's a static site with no build step, hosted on GitHub Pages with the custom domain in `CNAME`.

## Run locally

```bash
python -m http.server 8767
```
Then open http://localhost:8767
