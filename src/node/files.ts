import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const DEFAULT_OPERATORS_DIR = 'operators';

/** Resolve CLI file arguments: explicit files, directories (all *.yaml inside), or the default operators dir. */
export function resolveOperatorFiles(args: readonly string[], cwd = process.cwd()): string[] {
  const inputs = args.length > 0 ? args : [DEFAULT_OPERATORS_DIR];
  const files: string[] = [];
  for (const input of inputs) {
    const path = resolve(cwd, input);
    if (!existsSync(path)) throw new Error(`no such file or directory: ${input}`);
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path).sort()) {
        if (/\.ya?ml$/i.test(entry)) files.push(join(path, entry));
      }
    } else {
      files.push(path);
    }
  }
  return files;
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

export function readTextIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

export function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}
