# bun2mocha

Renders `bun test` output as a mocha-style report.

`bun test` prints every test with its full title path, `a > b > title`. bun2mocha prints each suite title once, as an indented tree, and collects every error into one summary at the end.

```
fixtures/math.fixture.ts:
  math
    add
      ✔ adds positives
      1) adds negatives
      ✔ is slow (101ms)
    mul
      ✔ multiplies
      - is skipped
      ✎ is todo

Ran 6 tests across 1 file. [107.00ms]

  3 passing (107ms)
  2 pending
  1 failing
────────────────────────────────────────────────────────────
  fixtures/math.fixture.ts
  1) math
       add
         adds negatives:
error: expect(received).toBe(expected)

Expected: -3
Received: -2
```

## Install

Requires bun 1.3 or later on `PATH`.

```sh
npm i -g ./bun2mocha
```

## Usage

Run bun through bun2mocha:

```sh
bun2mocha bun test [bun test args...]
```

Or pipe into it. Bun writes its report to stderr, so merge it into stdout:

```sh
bun test 2>&1 | bun2mocha
bun run test 2>&1 | bun2mocha   # e.g. "test": "bun test:unit && bun test:e2e"
```

Arguments before `bun` are reserved for bun2mocha. It accepts none yet.

It exits with code 2, without running anything, when given:
- both piped stdin and a bun command
- neither piped stdin nor a bun command
- any argument before `bun`

## Output

- **Tree**: each suite title prints once, indented by depth. The tree restarts for each test file and each bun run.
- **Marks**:
  - pass: green `✔`
  - fail: red `N) title`
  - skip: cyan `- title`
  - todo: magenta `✎ title`
- **Durations**: shown only for slow tests, using mocha's default threshold of 75ms.
  - Yellow above 37ms.
  - Red above 75ms.
- **Logs**: a passing test's output prints above it, under its suite.
- **Summary**: one summary at the end covers all piped runs. It has:
  - the passing, pending and failing counts.
  - each failure, separated by a horizontal line, with:
    - its test file
    - its titles as a tree
    - the lines bun printed for it
- **Replaced bun output**: bun's per-run counts and its end-of-run recap of failed, skipped and todo tests. bun's `Ran N tests across M files` line is kept.
- **Everything else** passes through untouched.

## Colors

bun2mocha colors its output only when stdout is a terminal or `FORCE_COLOR` is set. `NO_COLOR` turns colors off.

Bun colors its own output, such as code frames, only when it writes to a terminal:
- **Command form**: bun2mocha turns bun's colors on itself.
- **Piped form**: set them on bun yourself:
  ```sh
  FORCE_COLOR=1 bun test 2>&1 | bun2mocha
  ```

## Exit code

- **Command form**: bun's exit code, or 1 if any test failed.
- **Piped form**: 1 if any test failed, otherwise 0.

## Limits

- A title that contains ` > ` splits into extra suite levels.
- Lines bun prints between the previous test and a failing test are filed under that failure. This includes the failing test's own logs.
- When bun runs under an AI agent (`CLAUDECODE=1`), it prints only failing tests. The tree shows only those, but the counts stay correct.
- Stdin counts as piped only when it is a FIFO or a file. A socket counts as not piped.

## Development

```sh
bun test                         # end-to-end: runs real bun on tests/fixtures
./node_modules/.bin/tsc --noEmit
```
