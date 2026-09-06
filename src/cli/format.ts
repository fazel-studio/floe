import * as fs from "node:fs";
import * as path from "node:path";
import { format } from "../language/formatting.js";

export interface FormatOptions {
  write?: boolean;
  check?: boolean;
  stdout?: boolean;
  json?: boolean;
}

export function runFormat(files: string[], opts: FormatOptions = {}): number {
  if (files.length === 0) {
    console.error("floe format: no input files");
    console.error("Usage: floe format <file.floe> [--write] [--check]");
    return 2;
  }
  if (opts.write && opts.check) {
    console.error("floe format: --write and --check are mutually exclusive");
    return 2;
  }
  let hasUnformatted = false;
  for (const f of files) {
    const resolved = path.resolve(f);
    if (!fs.existsSync(resolved)) {
      console.error(`floe format: file not found: ${f}`);
      return 2;
    }
    let source: string;
    try {
      source = fs.readFileSync(resolved, "utf-8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Cannot read file '${f}': ${msg}`);
      return 2;
    }
    let formatted: string;
    try {
      formatted = format(source);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`floe format: internal error formatting '${f}': ${msg}`);
      return 1;
    }
    const needsFormat = source !== formatted;
    if (opts.check) {
      if (needsFormat) {
        hasUnformatted = true;
        const rel = path.relative(process.cwd(), resolved);
        if (!opts.json) console.error(`✖ ${rel}: not formatted`);
      }
      continue;
    }
    if (opts.write) {
      if (needsFormat) {
        try {
          fs.writeFileSync(resolved, formatted, "utf-8");
          const rel = path.relative(process.cwd(), resolved);
          if (!opts.json) console.log(`formatted ${rel}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`Cannot write file '${f}': ${msg}`);
          return 2;
        }
      }
      continue;
    }
    if (files.length === 1) {
      process.stdout.write(formatted);
    } else {
      const rel = path.relative(process.cwd(), resolved);
      console.error(`== ${rel} ==`);
      process.stdout.write(formatted);
      if (!formatted.endsWith("\n")) process.stdout.write("\n");
    }
  }
  if (opts.check) return hasUnformatted ? 1 : 0;
  return 0;
}

export function checkIsFormatted(source: string): boolean {
  return format(source) === source;
}
