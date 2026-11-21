# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/aufaakmalbunaya/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/aufaakmalbunaya/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: a hand-rolled, dependency-free CSV parser with identical answers on broken rows (stray CRs, unterminated quotes, quote junk, short and long rows), reading each case in a single left-to-right pass with indexOf-based field scanning. On the practice set it parses about 6x faster than the house baseline (pure parse time), and about 1.7x faster end to end including JSON input and output.

## How it is built

`solve.js` exports `run(input)`, which answers `{columns, rows, errors}` for `{text, header}` exactly as csv-reader 1.0.0 does. Plain records (no quote, no stray CR before the line break) are split with one `indexOf` per field; quoted and broken fields are read with `indexOf` scanning too, never one character at a time and never a regex. The next CR and the next quote are cached per call, so the search for them never re-scans text the parser already passed. No third-party packages, no network, no clock, no randomness, so the graded run is deterministic and both runs write the same bytes.

`main.ts` is the driver: it reads every case from `$MAKEFUN_INPUT_DIR/cases.json` (or `/input/cases.json`), answers each with `run`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json` (or `/output/answers.json`). It turns V8's incremental marking off before importing `solve.js`, as the house baseline does.

## Run it

```sh
node main.ts               # reads $MAKEFUN_INPUT_DIR/cases.json, writes $MAKEFUN_OUTPUT_DIR/answers.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=69qprj9z&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
