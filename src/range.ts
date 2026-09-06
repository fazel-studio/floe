/**
 * Source position and range utilities
 * Line and column are 1-indexed, offset is 0-indexed.
 */
export interface Position {
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column (UTF-16 code units) */
  column: number;
  /** 0-indexed offset from start of source */
  offset: number;
}
export interface Range {
  start: Position;
  end: Position;
}
export function pos(line: number, column: number, offset: number): Position {
  return { line, column, offset };
}
export function range(start: Position, end: Position): Range {
  return { start, end };
}
export function emptyRangeAt(p: Position): Range {
  return { start: p, end: p };
}
export function rangeToString(r: Range): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}
