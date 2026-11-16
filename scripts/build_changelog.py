"""Build mod/changelog.json: every mod version with its notes, newest first.

It reads each committed version of mod/latest.json from git history (plus the one in the working tree, so a
version being published right now is included). Run it before committing a new mod version:

    python scripts/build_changelog.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mod", "changelog.json")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout


def vkey(v):
    return tuple(int(p) if p.isdigit() else 0 for p in v.split("."))


def main():
    found = {}
    log = git("log", "--format=%H %cI", "--", "mod/latest.json").split("\n")
    for line in reversed([l for l in log if l.strip()]):   # oldest first, so later commits of a version win
        sha, date = line.split(" ", 1)
        try:
            j = json.loads(git("show", f"{sha}:mod/latest.json"))
        except Exception:
            continue
        if j.get("version"):
            found[j["version"]] = {"version": j["version"], "date": date[:10], "notes": j.get("notes", [])}
    try:
        with open(os.path.join(ROOT, "mod", "latest.json"), encoding="utf-8") as f:
            j = json.load(f)
        if j.get("version"):
            old = found.get(j["version"], {})
            found[j["version"]] = {"version": j["version"], "date": old.get("date") or __import__("datetime").date.today().isoformat(),
                                   "notes": j.get("notes", [])}
    except FileNotFoundError:
        pass
    out = sorted(found.values(), key=lambda e: vkey(e["version"]), reverse=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"versions": out}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"{len(out)} versions, newest {out[0]['version'] if out else '-'}", file=sys.stderr)


if __name__ == "__main__":
    main()
