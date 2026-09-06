#!/usr/bin/env node
/**
 * Floe CLI
 * Commands:
 *   floe check <file.floe> [--json] [--quiet]
 *   floe format <file.floe> [--write] [--check]
 *   floe render <file.floe> [-o output.svg]
 *   floe lsp [--stdio]   (starts LSP server)
 *
 * Keep CLI behavior scriptable for CI with appropriate exit codes:
 *   0 success
 *   1 validation / check failure
 *   2 usage / file not found error
 *
 * Treat .floe files as untrusted: never eval, ensure SVG cannot execute code.
 * This CLI never uses eval and delegates to safe core.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { runCheck } from "./check.js";
import { runFormat } from "./format.js";
import { runRender } from "./render.js";

const VERSION = "1.0.0";

function printHelp(): void {
  console.log(`Floe ${VERSION} — diagram DSL

Usage:
  floe <command> [options] <file...>

Commands:
  check   Validate a .floe file and print diagnostics
  format  Format file using canonical formatter
  render  Produce SVG output
  lsp     Start Language Server (stdio)
  help    Show this help

Options:
  -h, --help     Show help
  -v, --version  Show version

Check:
  floe check diagram.floe [--json] [--quiet]
    --json   Output diagnostics as JSON
    --quiet  Suppress OK messages

Format:
  floe format diagram.floe [--write] [--check]
    --write  Overwrite file in place
    --check  Exit 1 if file not formatted (for CI)
    (default: print formatted content to stdout)

Render:
  floe render diagram.floe [-o output.svg]
    -o, --output <file>  Write SVG to file (default: stdout)

LSP:
  floe lsp [--stdio]
    Starts LSP server over stdio (for editor integration)

Exit codes:
  0  success
  1  validation error / not formatted / render had errors
  2  usage or file error

Examples:
  floe check diagram.floe
  floe format diagram.floe --write
  floe render diagram.floe -o diagram.svg
  floe lsp

Docs: SPEC.md
`);
}

function printVersion(): void {
  console.log(VERSION);
}

function parseArgs(argv: string[]): { command?: string; files: string[]; opts: Record<string, any> } {
  const args = argv.slice(2);
  if (args.length === 0) return { files: [], opts: {} };
  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    return { command: "help", files: [], opts: {} };
  }
  if (args[0] === "--version" || args[0] === "-v" || args[0] === "version") {
    return { command: "version", files: [], opts: {} };
  }
  const command = args[0];
  const rest = args.slice(1);
  const files: string[] = [];
  const opts: Record<string, any> = {};
  let i = 0;
  while (i < rest.length) {
    const a = rest[i]!;
    if (a === "--json") { opts.json = true; i++; }
    else if (a === "--quiet" || a === "-q") { opts.quiet = true; i++; }
    else if (a === "--write" || a === "-w") { opts.write = true; i++; }
    else if (a === "--check" || a === "-c") { opts.check = true; i++; }
    else if (a === "--stdio") { opts.stdio = true; i++; }
    else if (a === "-o" || a === "--output") {
      const next = rest[i + 1];
      if (!next) { console.error(`floe ${command}: missing value for ${a}`); process.exit(2); }
      opts.output = next; i += 2;
    } else if (a === "--help" || a === "-h") { opts.help = true; i++; }
    else if (a === "--version" || a === "-v") { opts.version = true; i++; }
    else if (a.startsWith("-")) {
      console.error(`floe ${command}: unknown option ${a}`);
      console.error(`Run 'floe ${command} --help' for usage.`);
      process.exit(2);
    } else { files.push(a); i++; }
  }
  return { command, files, opts };
}

async function main(): Promise<void> {
  const { command, files, opts } = parseArgs(process.argv);
  if (!command) { printHelp(); process.exit(2); }
  if (command === "help") { printHelp(); process.exit(0); }
  if (command === "version") { printVersion(); process.exit(0); }
  if (opts.help) { printHelp(); process.exit(0); }
  if (opts.version) { printVersion(); process.exit(0); }
  let exitCode = 0;
  switch (command) {
    case "check": { exitCode = runCheck(files, { json: !!opts.json, quiet: !!opts.quiet }); break; }
    case "format": { exitCode = runFormat(files, { write: !!opts.write, check: !!opts.check, json: !!opts.json }); break; }
    case "render": { exitCode = runRender(files, { output: opts.output, json: !!opts.json }); break; }
    case "lsp":
    case "lsp-server": {
      const { startLspServer } = await import("../lsp/server.js");
      await startLspServer({ stdio: true });
      return;
    }
    default: { console.error(`floe: unknown command '${command}'`); console.error("Run 'floe --help' for usage."); process.exit(2); }
  }
  process.exit(exitCode);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`floe: internal error: ${msg}`);
  if (process.env.FLOE_DEBUG) console.error(e instanceof Error ? e.stack : "");
  process.exit(1);
});
