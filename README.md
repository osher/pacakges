# oe-packages

Bun workspaces monorepo. Each directory at the root is a package.

## Packages

| Package | Description |
| --- | --- |
| [bun2mocha](bun2mocha) | Renders `bun test` output as a mocha-style report |

## Setup

Requires bun 1.3 or later.

```sh
bun install
```

## Scripts

```sh
bun run test   # runs the test script of every package
```

## Adding a package

1. Create a directory at the root with its own `package.json`.
2. Run `bun install` at the root. The workspace glob `*` picks the package up.
