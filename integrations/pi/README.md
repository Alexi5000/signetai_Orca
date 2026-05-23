# Pi Integration

Signet connector for Pi.

## What It Does

Integrates Signet's memory system with Pi via its extension mechanism.

- Installs a managed Signet extension into the Pi extensions directory
- Configures the agent workspace path in Pi's config
- Detects and resolves multiple candidate agent directories
- Ships a bundled extension that is written to disk on install

## Installation

```bash
signet install pi
```

This is handled automatically when you run `signet install` and Pi is detected.

## Uninstallation

```bash
signet uninstall pi
```

Removes the extension file and clears workspace configuration. Your memories are preserved in the Signet daemon.

## Package

| Field | Value |
|-------|-------|
| Package | `@signet/connector-pi` |
| License | Apache-2.0 |

## Architecture

```
<pi-extensions>/signet-pi.js   <-- managed extension
<pi-config>/config.json        <-- agent dir configured here
~/.agents/                     <-- agent workspace
```

The connector extends `BaseConnector` from `@signet/connector-base` and implements `install()` / `uninstall()` for reversible setup.
