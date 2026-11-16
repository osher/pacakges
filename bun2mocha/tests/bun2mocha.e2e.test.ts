import { describe, it, expect, beforeAll } from "bun:test";

// bun hides passing tests when it detects an AI agent, colors depend on the caller's terminal
const { CLAUDECODE, AI_AGENT, FORCE_COLOR, NO_COLOR, ...env } = process.env;

type Run = { stdout: string; stderr: string; code: number };
const run = async (script: string): Promise<Run> => {
  const p = Bun.spawn(["sh", "-c", script], { cwd: import.meta.dir, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { stdout: stdout.replace(/\((\d+(\.\d+)?)(ms|s)\)/g, "(N)"), stderr, code };
};

describe("bun2mocha", () => {
  describe("when piped the output of several `bun test` runs", () => {
    let r: Run;
    beforeAll(async () => {
      r = await run(
        "(bun test ./fixtures/math.fixture.ts; bun test ./fixtures/strings.fixture.ts) 2>&1 | ../bin/bun2mocha.ts",
      );
    });

    it("should render a file's tests as a tree of suite titles, with the logs of a passing test above it", () => {
      expect(r.stdout).toContain(
        [
          "  math",
          "    add",
          "      ✔ adds positives",
          "      1) adds negatives",
          "      ✔ is slow (N)",
          "    mul",
          "a log line from mul",
          "      ✔ multiplies",
          "      - is skipped",
          "      ✎ is todo",
        ].join("\n"),
      );
    });

    it("should show the duration of slow tests only", () => {
      expect(r.stdout).toContain("      ✔ adds positives\n");
      expect(r.stdout).toContain("      ✔ is slow (N)\n");
    });

    it("should restart the tree for each run", () => {
      expect(r.stdout).toContain(["  math", "    div", "      ✔ divides"].join("\n"));
    });

    it("should keep bun's totals line of each run", () => {
      expect(r.stdout).toContain("Ran 6 tests across 1 file.");
      expect(r.stdout).toContain("Ran 2 tests across 1 file.");
    });

    it("should replace bun's counts of each run with one summary of all runs", () => {
      expect(r.stdout).not.toMatch(/^ \d+ (pass|fail|skip|todo)$/m);
      expect(r.stdout).toContain(["", "  4 passing (N)", "  2 pending", "  2 failing", ""].join("\n"));
    });

    it("should list each failure in the summary by its titles, followed by the lines bun printed for it", () => {
      const summary = r.stdout.slice(r.stdout.indexOf("  4 passing"));
      expect(summary).toContain(
        [
          "  1) math",
          "       add",
          "         adds negatives:",
          "error: expect(received).toBe(expected)",
          "",
          "Expected: -3",
          "Received: -2",
        ].join("\n"),
      );
      expect(summary).toContain(["  2) strings", "       throws:"].join("\n"));
      expect(summary.indexOf("error: boom")).toBeGreaterThan(summary.indexOf("  2) strings"));
    });

    it("should separate each failure in the summary with a line as wide as the screen", () => {
      const rule = "─".repeat(Number(env.COLUMNS) || 80);
      expect(r.stdout).toMatch(new RegExp(`\n${rule}\n.*\n  1\\) math\n`));
      expect(r.stdout).toMatch(new RegExp(`\n${rule}\n.*\n  2\\) strings\n`));
    });

    it("should name the test file of each failure in the summary, below its separator", () => {
      expect(r.stdout).toContain("─\n  fixtures/math.fixture.ts\n  1) math\n");
      expect(r.stdout).toContain("─\n  fixtures/strings.fixture.ts\n  2) strings\n");
    });

    it("should print the lines bun printed for a failure only once", () => {
      expect(r.stdout.split("Received: -2")).toHaveLength(2);
      expect(r.stdout.split("error: boom")).toHaveLength(2);
    });

    it("should exit 1", () => {
      expect(r.code).toBe(1);
    });

    describe("and the output is colored", () => {
      let colored: Run;
      beforeAll(async () => {
        colored = await run("FORCE_COLOR=1 bun test ./fixtures/math.fixture.ts 2>&1 | ../bin/bun2mocha.ts");
      });

      it("should render the same tree", () => {
        const out = Bun.stripANSI(colored.stdout);
        expect(out).toContain(["  math", "    add", "      ✔ adds positives"].join("\n"));
        expect(out).toContain(["      1) adds negatives", "      ✔ is slow (N)", "    mul"].join("\n"));
        expect(out).toContain(["      - is skipped", "      ✎ is todo"].join("\n"));
      });

      it("should replace bun's counts", () => {
        expect(Bun.stripANSI(colored.stdout)).not.toMatch(/^ \d+ (pass|fail|skip|todo)$/m);
      });
    });
  });

  describe("when piped a run long enough for bun to recap its skipped, todo and failed tests", () => {
    let r: Run;
    beforeAll(async () => {
      r = await run("bun test ./fixtures/long-run.fixture.ts 2>&1 | ../bin/bun2mocha.ts");
    });

    it("should drop the recap", () => {
      expect(r.stdout).not.toMatch(/tests (failed|skipped|todo):/);
      expect(r.stdout).not.toMatch(/^\((fail|skip|todo)\)/m);
    });

    it("should number each failure once", () => {
      expect(r.stdout).toContain("      1) fails\n");
      expect(r.stdout).toContain("      2) times out\n");
      expect(r.stdout).not.toContain("3)");
    });

    it("should list bun's note on a failure printed below it with that failure", () => {
      expect(r.stdout).toContain(["         times out:", "  ^ this test timed out after 10ms."].join("\n"));
      expect(r.stdout.split("timed out after")).toHaveLength(2);
    });
  });

  describe("when given a bun command", () => {
    let r: Run;
    beforeAll(async () => {
      r = await run("../bin/bun2mocha.ts bun test ./fixtures/strings.fixture.ts");
    });

    it("should render bun's merged stdout and stderr as a tree", () => {
      expect(r.stdout).toContain(["  math", "    div", "      ✔ divides", "", "  strings", "    1) throws"].join("\n"));
      expect(r.stdout).toContain(["  1) strings", "       throws:"].join("\n"));
      expect(r.stdout).toContain("error: boom");
    });

    it("should exit with bun's failing code", () => {
      expect(r.code).toBe(1);
    });
  });

  describe("when invoked wrongly", () => {
    for (const [title, script, reason] of [
      ["both piped stdin and a bun command", "echo | ../bin/bun2mocha.ts bun test ./fixtures/strings.fixture.ts", "both"],
      ["neither piped stdin nor a bun command", "../bin/bun2mocha.ts", "nothing to read"],
      ["an argument before the bun command", "../bin/bun2mocha.ts --nope bun test", "unknown argument: --nope"],
    ]) {
      describe(`and given ${title}`, () => {
        let r: Run;
        beforeAll(async () => {
          r = await run(script!);
        });

        it("should exit 2 with the reason and usage, without running bun", () => {
          expect(r.code).toBe(2);
          expect(r.stdout).toBe("");
          expect(r.stderr).toContain(reason!);
          expect(r.stderr).toContain("usage:");
        });
      });
    }
  });
});
