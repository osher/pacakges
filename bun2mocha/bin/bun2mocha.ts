#!/usr/bin/env bun
// Turns `bun test` output into a mocha-style report: one indented tree of suite titles
// instead of every test repeating its full `a > b > c` path. Unrecognized lines pass through untouched.
import { spawn } from "node:child_process";
import { fstatSync } from "node:fs";
import { createInterface } from "node:readline";

const USAGE = `usage:
  bun test 2>&1 | bun2mocha
  bun2mocha bun test [bun test args...]`;
const SLOW = 75; // ms, mocha's default: above SLOW/2 shows yellow, above SLOW red

const { env } = process;
const args = process.argv.slice(2);
const at = args.indexOf("bun");
const own = at < 0 ? args : args.slice(0, at); // args before `bun` are reserved for bun2mocha
const cmd = at < 0 ? [] : args.slice(at);
const stdin = fstatSync(0);
const piped = stdin.isFIFO() || stdin.isFile();

const usage = (msg: string) => {
  console.error(`bun2mocha: ${msg}\n${USAGE}`);
  process.exit(2);
};
if (own.length) usage(`unknown argument: ${own[0]}`);
if (cmd.length && piped) usage("got both piped stdin and a bun command, use one");
if (!cmd.length && !piped) usage("nothing to read, pipe `bun test 2>&1` in or pass a bun command");

const color = env.FORCE_COLOR ? env.FORCE_COLOR !== "0" : !env.NO_COLOR && !!process.stdout.isTTY;
const paint = (code: number | string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = paint(31), green = paint(32), yellow = paint(33), magenta = paint(35), cyan = paint(36), gray = paint(90), boldGray = paint("1;90");

// bun prints `(pass) a > b > title [1.23ms]` when plain and `✓ a > b > title [1.23ms]` when colored
const RESULT = /^(?:\((pass|fail|skip|todo)\)|([✓✗»✎])) (.*?)(?: \[([\d.]+)ms\])?$/;
const SYMBOL: Record<string, Status> = { "✓": "pass", "✗": "fail", "»": "skip", "✎": "todo" };
const RUN_START = /^bun test v/;
const FILE = /^\S.*\.[cm]?[jt]sx?:$/;
const COUNT = /^\s*(\d+) (pass|skip|todo|fail)$/;
const RAN = /^Ran \d+ tests? across \d+ files?\. \[([\d.]+)(ms|s)\]$/;
const NOTE = /^\s+\^ /; // bun's note on the test above it, e.g. `  ^ this test timed out after 100ms.`
const RECAP = /^\d+ tests? (failed|skipped|todo):$/; // long runs repeat these tests, without their errors, before the counts

type Status = "pass" | "fail" | "skip" | "todo";
const counts = () => ({ pass: 0, fail: 0, skip: 0, todo: 0 });
const reported = counts(); // from bun's summary blocks, includes tests bun did not print
const seen = counts(); // from result lines, used when no summary arrived
let reportedAny = false;
let ranMs = 0;

let file = ""; // test file printed last
let suites: string[] = []; // suite path printed last
let held: string[] = []; // lines since the last result: logs and failure details of the next test
let fileStart = true;
let lastResult: Status | undefined;
let recap = false; // inside bun's recap, which the final summary replaces
const failures: { file: string; titles: string[]; details: string[] }[] = [];

const out = (s: string) => process.stdout.write(s + "\n");
const flush = () => {
  held.forEach(out);
  held = [];
};
const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
const speed = (ms?: string) => {
  const n = Math.round(Number(ms));
  return !ms || n <= SLOW / 2 ? "" : (n > SLOW ? red : yellow)(` (${n}ms)`);
};

function onResult(status: Status, path: string[], ms?: string) {
  const title = path.pop()!;
  let i = 0;
  while (i < path.length && path[i] === suites[i]) i++;
  if (i === 0 && path.length && !fileStart) out("");
  for (; i < path.length; i++) out(`${"  ".repeat(i + 1)}${path[i]}`);
  suites = path;

  const indent = "  ".repeat(path.length + 1);
  seen[status]++;
  if (status === "fail") {
    failures.push({ file, titles: [...path, title], details: held }); // shown once, in the final summary
    held = [];
    out(red(`${indent}${failures.length}) ${title}`) + speed(ms));
  } else flush();
  if (status === "pass") out(`${indent}${green("✔")} ${gray(title)}${speed(ms)}`);
  if (status === "skip") out(cyan(`${indent}- ${title}`));
  if (status === "todo") out(magenta(`${indent}✎ ${title}`));
  fileStart = false;
  lastResult = status;
}

function onLine(raw: string) {
  const line = Bun.stripANSI(raw).replace(/\r$/, "");
  let m: RegExpExecArray | null;
  if ((m = COUNT.exec(line))) {
    recap = false;
    reported[m[2] as Status] += Number(m[1]);
    reportedAny = true;
    return; // the final summary replaces bun's counts
  }
  if (RECAP.test(line)) recap = true;
  if (recap) return;
  if ((m = RESULT.exec(line))) return onResult(SYMBOL[m[2]!] ?? (m[1] as Status), m[3]!.split(" > "), m[4]);
  if (lastResult && !held.length && NOTE.test(line)) {
    if (lastResult === "fail") failures.at(-1)!.details.push(raw);
    else out(raw);
    return;
  }
  lastResult = undefined;
  if (RUN_START.test(line) || FILE.test(line)) {
    flush();
    if (FILE.test(line)) file = line.slice(0, -1);
    suites = [];
    fileStart = true;
    return out(raw);
  }
  if ((m = RAN.exec(line))) ranMs += Number(m[1]) * (m[2] === "s" ? 1000 : 1);
  held.push(raw);
}

function summary() {
  flush();
  const t = reportedAny ? reported : seen;
  out("");
  out(green(`  ${t.pass} passing`) + (ranMs ? gray(` (${fmt(ranMs)})`) : ""));
  if (t.skip + t.todo) out(cyan(`  ${t.skip + t.todo} pending`));
  if (t.fail) out(red(`  ${t.fail} failing`));
  const rule = gray("─".repeat(process.stdout.columns || Number(env.COLUMNS) || 80));
  failures.forEach(({ file, titles: [first, ...rest], details }, n) => {
    out(rule);
    if (file) out(boldGray(`  ${file}`));
    const titles = [`  ${n + 1}) ${first}`, ...rest.map((title, i) => `${" ".repeat(7 + 2 * i)}${title}`)];
    out(titles.join("\n") + ":");
    details.forEach(out);
  });
  out("");
  return t.fail;
}

// `exec "$@" 2>&1` gives the child one pipe for both streams, the same ordering as a shell `2>&1 |`
const child = cmd.length
  ? spawn("sh", ["-c", 'exec "$@" 2>&1', "sh", ...cmd], {
      stdio: ["inherit", "pipe", "inherit"],
      env: color ? { ...env, FORCE_COLOR: "1" } : env,
    })
  : undefined;
const exited = child && new Promise<number>((r) => child.on("close", (code) => r(code ?? 1)));

for await (const line of createInterface({ input: child?.stdout ?? process.stdin, crlfDelay: Infinity })) onLine(line);
const failed = summary();
process.exit((await exited) || (failed ? 1 : 0));
