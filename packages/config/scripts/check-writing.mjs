#!/usr/bin/env node
// Enforces the writing standards in docs/DESIGN.md section 19.
// It checks prose only: Markdown outside code, translation strings,
// email templates and code comments. Code itself is never checked,
// so command-line flags like --verbose stay legal.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const rules = JSON.parse(readFileSync(join(here, '..', 'writing-rules.json'), 'utf8'));
const ignored = new Set(rules.ignoreDirectories);

function walk(path, out = []) {
  if (!existsSync(path)) return out;
  const stats = statSync(path);
  if (stats.isFile()) {
    out.push(path);
    return out;
  }
  for (const entry of readdirSync(path)) {
    if (ignored.has(entry)) continue;
    walk(join(path, entry), out);
  }
  return out;
}

function stripMarkdownCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length));
}

function collectJsonStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectJsonStrings(item, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => collectJsonStrings(item, out));
  return out;
}

function extractComments(source) {
  const lines = source.split('\n');
  return lines.map((line) => {
    const lineComment = line.match(/(^|[^:"'`])\/\/(.*)$/);
    if (lineComment) return lineComment[2];
    const blockComment = line.match(/^\s*(\/\*\*?|\*)(.*)$/);
    if (blockComment) return blockComment[2];
    return '';
  });
}

const phraseRegexes = rules.bannedPhrases.map((phrase) => ({
  phrase,
  regex: new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i'),
}));
const patternRegexes = rules.bannedPatterns.map((rule) => ({
  ...rule,
  regex: new RegExp(rule.pattern),
}));

const problems = [];

function checkLines(file, lines) {
  lines.forEach((line, index) => {
    if (!line) return;
    for (const rule of rules.bannedCharacters) {
      if (line.includes(rule.char))
        problems.push({ file, line: index + 1, issue: rule.name, fix: rule.fix });
    }
    for (const rule of patternRegexes) {
      if (rule.regex.test(line))
        problems.push({ file, line: index + 1, issue: rule.name, fix: rule.fix });
    }
    for (const { phrase, regex } of phraseRegexes) {
      if (regex.test(line))
        problems.push({
          file,
          line: index + 1,
          issue: `banned phrase "${phrase}"`,
          fix: 'Say what the thing does in plain words.',
        });
    }
  });
}

for (const target of rules.include.markdown) {
  for (const file of walk(join(repoRoot, target)).filter((f) => extname(f) === '.md')) {
    checkLines(file, stripMarkdownCode(readFileSync(file, 'utf8')).split('\n'));
  }
}

for (const target of rules.include.json) {
  for (const file of walk(join(repoRoot, target)).filter((f) => extname(f) === '.json')) {
    const strings = collectJsonStrings(JSON.parse(readFileSync(file, 'utf8')));
    checkLines(file, strings);
  }
}

for (const target of rules.include.templates) {
  for (const file of walk(join(repoRoot, target)).filter((f) =>
    /\.template\.(ts|html|txt)$/.test(f),
  )) {
    checkLines(file, readFileSync(file, 'utf8').split('\n'));
  }
}

for (const target of rules.include.codeComments) {
  for (const file of walk(join(repoRoot, target)).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f))) {
    if (file.endsWith('check-writing.mjs')) continue;
    checkLines(file, extractComments(readFileSync(file, 'utf8')));
  }
}

if (problems.length > 0) {
  console.error(`Writing check failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) {
    console.error(
      `  ${relative(repoRoot, problem.file)}:${problem.line}  ${problem.issue}. ${problem.fix}`,
    );
  }
  process.exit(1);
}
console.log('Writing check passed.');
