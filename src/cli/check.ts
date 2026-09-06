import * as fs from "node:fs";
import * as path from "node:path";
import { parseFloe } from "../index.js";
import type { Diagnostic } from "../diagnostics.js";

export interface CheckOptions {
  json?: boolean;
  quiet?: boolean;
}

export interface CheckResult {
  file: string;
  diagnostics: Diagnostic[];
  hasErrors: boolean;
}

export function formatDiagnostic(file: string, d: Diagnostic): string {
  const { line, column } = d.range.start;
  return `${file}:${line}:${column} ${d.code} ${d.severity} ${d.message}`;
}

export function checkFile(filePath: string, opts: CheckOptions = {}): CheckResult {
  let source: string;
  try {
    source = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Cannot read file '${filePath}': ${msg}`);
  }
  const { diagnostics } = parseFloe(source);
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  return { file: filePath, diagnostics, hasErrors };
}

export function runCheck(files: string[], opts: CheckOptions = {}): number {
  if (files.length === 0) {
    console.error("floe check: no input files");
    console.error("Usage: floe check <file.floe> [--json]");
    return 2;
  }
  let overallHasErrors = false;
  const overallOutput: CheckResult[] = [];
  for (const f of files) {
    const resolved = path.resolve(f);
    if (!fs.existsSync(resolved)) {
      console.error(`floe check: file not found: ${f}`);
      return 2;
    }
    try {
      const result = checkFile(resolved, opts);
      overallOutput.push(result);
      if (result.hasErrors) overallHasErrors = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
      return 2;
    }
  }
  if (opts.json) {
    const jsonOut = overallOutput.map((r) => ({
      file: path.relative(process.cwd(), r.file),
      diagnostics: r.diagnostics.map((d) => ({
        code: d.code,
        severity: d.severity,
        message: d.message,
        range: d.range,
      })),
      hasErrors: r.hasErrors,
    }));
    console.log(JSON.stringify(jsonOut, null, 2));
  } else {
    for (const r of overallOutput) {
      const rel = path.relative(process.cwd(), r.file);
      if (r.diagnostics.length === 0) {
        if (!opts.quiet) console.log(`✔ ${rel}: OK`);
      } else {
        const errCount = r.diagnostics.filter((d) => d.severity === "error").length;
        const warnCount = r.diagnostics.filter((d) => d.severity === "warning").length;
        if (!opts.quiet) {
          if (errCount > 0) console.error(`✖ ${rel}: ${errCount} error(s)${warnCount ? `, ${warnCount} warning(s)` : ""}`);
          else console.log(`✔ ${rel}: ${warnCount} warning(s)`);
        }
        for (const d of r.diagnostics) {
          const line = formatDiagnostic(rel, d);
          if (d.severity === "error") console.error(line);
          else console.log(line);
        }
      }
    }
  }
  return overallHasErrors ? 1 : 0;
}
