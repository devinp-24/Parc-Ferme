// Small, dependency-free parsers for the three formats the sources speak.
//
//   parseJsLiteral  the official car list ships its data as JavaScript modules
//                   (`var e={car102:{...}};export{e as default};`). Importing
//                   them would mean executing code fetched from the internet,
//                   so they are read as DATA instead: a strict parser for object
//                   and array literals, strings, template strings and numbers.
//                   Anything else -- a function call, an interpolation -- is
//                   rejected rather than guessed at.
//   parseCsv        gt7info's tables. Quote-aware, though in practice none of
//                   the current files need it.
//   readTar         GitHub's tarball of gt7info, so a sync is one download
//                   rather than three thousand.

import { gunzipSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// JS object literal -> plain data
// ---------------------------------------------------------------------------

export function parseJsLiteral(source) {
  // The module assigns one literal to a variable and exports it. Start at the
  // first `{` or `[` after the assignment.
  const assign = source.search(/=\s*[{[]/);
  if (assign === -1) throw new Error('No object literal found in module');
  const parser = new LiteralParser(source, source.indexOf('=', assign) + 1);
  return parser.value();
}

class LiteralParser {
  constructor(src, pos) {
    this.src = src;
    this.pos = pos;
  }

  fail(message) {
    const around = this.src.slice(Math.max(0, this.pos - 30), this.pos + 30);
    throw new Error(`${message} at ${this.pos}: …${around}…`);
  }

  skip() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos += 1;
  }

  value() {
    this.skip();
    const ch = this.src[this.pos];
    if (ch === '{') return this.object();
    if (ch === '[') return this.array();
    if (ch === '`') return this.template();
    if (ch === '"' || ch === "'") return this.string(ch);
    if (ch === '!' && (this.src[this.pos + 1] === '0' || this.src[this.pos + 1] === '1')) {
      // Minifiers write true/false as !0/!1.
      this.pos += 2;
      return this.src[this.pos - 1] === '0';
    }
    if (ch === '-' || ch === '.' || /\d/.test(ch)) return this.number();
    const word = this.src.slice(this.pos).match(/^(true|false|null|void 0)\b/);
    if (word) {
      this.pos += word[0].length;
      return { true: true, false: false, null: null, 'void 0': null }[word[0]];
    }
    return this.fail('Unexpected token');
  }

  object() {
    const out = {};
    this.pos += 1; // {
    for (;;) {
      this.skip();
      if (this.src[this.pos] === '}') {
        this.pos += 1;
        return out;
      }
      const key = this.key();
      this.skip();
      if (this.src[this.pos] !== ':') this.fail('Expected ":"');
      this.pos += 1;
      out[key] = this.value();
      this.skip();
      if (this.src[this.pos] === ',') this.pos += 1;
      else if (this.src[this.pos] !== '}') this.fail('Expected "," or "}"');
    }
  }

  key() {
    const ch = this.src[this.pos];
    if (ch === '"' || ch === "'") return this.string(ch);
    if (ch === '`') return this.template();
    const ident = this.src.slice(this.pos).match(/^[A-Za-z_$][\w$]*|^\d+/);
    if (!ident) this.fail('Expected a key');
    this.pos += ident[0].length;
    return ident[0];
  }

  array() {
    const out = [];
    this.pos += 1; // [
    for (;;) {
      this.skip();
      if (this.src[this.pos] === ']') {
        this.pos += 1;
        return out;
      }
      out.push(this.value());
      this.skip();
      if (this.src[this.pos] === ',') this.pos += 1;
      else if (this.src[this.pos] !== ']') this.fail('Expected "," or "]"');
    }
  }

  number() {
    const m = this.src.slice(this.pos).match(/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (!m) this.fail('Bad number');
    this.pos += m[0].length;
    return Number(m[0]);
  }

  escape() {
    const ch = this.src[this.pos];
    this.pos += 1;
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0': return '\0';
      case 'u': {
        if (this.src[this.pos] === '{') {
          const end = this.src.indexOf('}', this.pos);
          const code = parseInt(this.src.slice(this.pos + 1, end), 16);
          this.pos = end + 1;
          return String.fromCodePoint(code);
        }
        const code = parseInt(this.src.slice(this.pos, this.pos + 4), 16);
        this.pos += 4;
        return String.fromCharCode(code);
      }
      case 'x': {
        const code = parseInt(this.src.slice(this.pos, this.pos + 2), 16);
        this.pos += 2;
        return String.fromCharCode(code);
      }
      case '\n': return ''; // line continuation
      default: return ch; // \\ \` \' \" \$ and friends
    }
  }

  string(quote) {
    let out = '';
    this.pos += 1;
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === quote) {
        this.pos += 1;
        return out;
      }
      if (ch === '\\') {
        this.pos += 1;
        out += this.escape();
      } else {
        out += ch;
        this.pos += 1;
      }
    }
    return this.fail('Unterminated string');
  }

  template() {
    let out = '';
    this.pos += 1;
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === '`') {
        this.pos += 1;
        return out;
      }
      if (ch === '$' && this.src[this.pos + 1] === '{') this.fail('Template interpolation is not data');
      if (ch === '\\') {
        this.pos += 1;
        out += this.escape();
      } else {
        out += ch;
        this.pos += 1;
      }
    }
    return this.fail('Unterminated template');
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()])));
}

// ---------------------------------------------------------------------------
// tar.gz
// ---------------------------------------------------------------------------

const cstr = (buf, start, len) => {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString('utf8');
};

function parsePax(data) {
  // Records look like "30 path=some/long/name\n": a decimal length, a space,
  // key=value, newline.
  const out = {};
  let off = 0;
  const text = data.toString('utf8');
  while (off < text.length) {
    const space = text.indexOf(' ', off);
    if (space === -1) break;
    const len = Number(text.slice(off, space));
    if (!len) break;
    const record = text.slice(space + 1, off + len - 1);
    const eq = record.indexOf('=');
    if (eq !== -1) out[record.slice(0, eq)] = record.slice(eq + 1);
    off += len;
  }
  return out;
}

/**
 * Unpack a .tar.gz held in memory. Returns the regular files and the global
 * pax header -- GitHub puts the commit SHA in its `comment` field, which is
 * how a sync knows exactly which gt7info revision it read.
 */
export function readTarGz(gzipped) {
  const buf = gunzipSync(gzipped);
  const files = [];
  let globalHeader = {};
  let longName = null;
  let paxPath = null;
  let off = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = cstr(header, 0, 100);
    const size = parseInt(cstr(header, 124, 12).trim() || '0', 8) || 0;
    const type = String.fromCharCode(header[156] || 48);
    const prefix = cstr(header, 345, 155);
    off += 512;
    const data = buf.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;

    if (type === 'g') {
      globalHeader = { ...globalHeader, ...parsePax(data) };
      continue;
    }
    if (type === 'x') {
      paxPath = parsePax(data).path ?? null;
      continue;
    }
    if (type === 'L') {
      longName = cstr(data, 0, size);
      continue;
    }
    const path = longName ?? paxPath ?? (prefix ? `${prefix}/${name}` : name);
    longName = null;
    paxPath = null;
    if (type === '0' || type === '\0' || type === '7') files.push({ path, data });
  }
  return { files, globalHeader };
}
