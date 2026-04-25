# huozi — Plugin Marketplace

Official Claude Code plugins for [huozi.app](https://huozi.app), the Agent-native cloud drive.

## Install

In Claude Code, run:

```
/plugin marketplace add https://huozi.app/marketplace.json
/plugin install huozi@huozi
```

After install, restart Claude Code (or open a new session). The `huozi` skill becomes auto-discoverable — say things like *"publish this as a deck to huozi"* and the agent picks the right template.

## Update

Pull the latest version:

```
/plugin marketplace update huozi
```

If the marketplace entry's `version` bumped, the plugin auto-updates on next start.

## Uninstall

```
/plugin uninstall huozi@huozi
/plugin marketplace remove huozi
```

## What ships

| Plugin | Skill | What it does |
|---|---|---|
| `huozi` | `huozi` | Publishes Markdown/HTML to huozi.app. Ships 5 standard format templates: `deck` (16:9 slide), `story` (9:16 vertical), `paper` (A4 print), `mobile` (long page, mobile-first), `page` (long page, desktop-first). |

## Local development

If you're hacking on the skill, symlink the plugin dir into Claude Code's local plugin discovery instead of installing through the marketplace:

```
ln -s "$(pwd)/huozi" ~/.claude/plugins/huozi
```

Restart Claude Code once. After that, edits to `huozi/skills/huozi/SKILL.md` and `huozi/skills/huozi/templates/*.html` are picked up live.

## Repo layout

```
skill-pack/
├── .claude-plugin/
│   └── marketplace.json        # marketplace manifest
└── huozi/                      # plugin
    ├── .claude-plugin/
    │   └── plugin.json         # plugin manifest
    └── skills/
        └── huozi/              # the skill itself
            ├── SKILL.md
            ├── REFERENCES.md
            └── templates/
                ├── deck.html
                ├── story.html
                ├── paper.html
                ├── mobile.html
                └── page.html
```
