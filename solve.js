// Fast CSV reader with csv-reader 1.0.0 semantics.
//
// Reads a CSV text once, left to right, and answers {columns, rows, errors}
// exactly as csv-reader 1.0.0 does: a U+FEFF at the very start is dropped;
// a record ends at LF or CRLF, and a line left with no characters is no
// record; outside quotes a CR not followed by LF is dropped (stray_cr);
// a field that opens with a quote runs to the next quote that is not
// doubled, "" inside it is one quote, each CRLF or lone CR inside it is
// read as LF; what follows its closing quote, up to the next comma or line
// break, is appended as it stands (quote_junk, when the field ends); a
// quote that never closes is a literal character, and the text after it is
// read again as unquoted (unterminated_quote); a quote inside an unquoted
// field is a literal character; fields stay strings, never trimmed or
// converted; columns is the first record when header is true, else null;
// rows holds the records after it, each padded (short_row) or cut
// (long_row) to the first record's width; each error is {code, line, row}.
//
// Speed comes from indexOf-based scanning instead of a character at a
// time: a plain record (no quote, no stray CR before its line break) is
// split with one indexOf per field, and a field is one slice, never a
// chain of one-character appends. The next CR and the next quote are
// cached per call, so the search for them never re-scans text the parser
// already passed.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The next CR / quote at or after the position each was last asked from.
  // -2 means unknown, -1 means none left in the text. pos only moves
  // forward, except for the unterminated-quote re-read, which clears these.
  let nextCR = -2;
  let nextQuote = -2;

  function peekCR(from) {
    if (nextCR === -2) nextCR = text.indexOf('\r', from);
    else if (nextCR !== -1 && nextCR < from) nextCR = text.indexOf('\r', from);
    return nextCR;
  }

  function peekQuote(from) {
    if (nextQuote === -2) nextQuote = text.indexOf('"', from);
    else if (nextQuote !== -1 && nextQuote < from) nextQuote = text.indexOf('"', from);
    return nextQuote;
  }

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the
  // field and how it ended; `added` counts the characters kept here.
  function readUnquoted(value) {
    let added = 0;
    let out = value;
    let start = pos;
    for (;;) {
      const ci = text.indexOf(',', start);
      const ni = text.indexOf('\n', start);
      const ri = peekCR(start);
      let end = -1;
      let kind = END;
      if (ci !== -1 && (ni === -1 || ci < ni)) {
        end = ci;
        kind = COMMA;
      } else if (ni !== -1) {
        end = ni;
        kind = LINE_BREAK;
      }
      if (ri !== -1 && (end === -1 || ri < end)) {
        if (text.charCodeAt(ri + 1) === 10) {
          // CRLF line break: the CR is not part of the field.
          if (ri > start) {
            out += text.slice(start, ri);
            added += ri - start;
          }
          pos = ri + 2;
          line += 1;
          return { value: out, ended: LINE_BREAK, added };
        }
        error('stray_cr');
        if (ri > start) {
          out += text.slice(start, ri);
          added += ri - start;
        }
        start = ri + 1;
        continue;
      }
      if (kind === COMMA) {
        if (end > start) {
          out += text.slice(start, end);
          added += end - start;
        }
        pos = end + 1;
        return { value: out, ended: COMMA, added };
      }
      if (kind === LINE_BREAK) {
        if (end > start) {
          out += text.slice(start, end);
          added += end - start;
        }
        pos = end + 1;
        line += 1;
        return { value: out, ended: LINE_BREAK, added };
      }
      if (n > start) {
        out += text.slice(start, n);
        added += n - start;
      }
      pos = n;
      return { value: out, ended: END, added };
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let out = '';
    let start = pos + 1;
    for (;;) {
      const qi = text.indexOf('"', start);
      const ri = text.indexOf('\r', start);
      const ni = text.indexOf('\n', start);
      let j = -1;
      let kind = 0; // 1 quote, 2 CR, 3 LF
      if (qi !== -1) {
        j = qi;
        kind = 1;
      }
      if (ri !== -1 && (j === -1 || ri < j)) {
        j = ri;
        kind = 2;
      }
      if (ni !== -1 && (j === -1 || ni < j)) {
        j = ni;
        kind = 3;
      }
      if (j === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        nextCR = -2;
        nextQuote = -2;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (kind === 1) {
        if (text.charCodeAt(j + 1) === 34) {
          if (j > start) out += text.slice(start, j);
          out += '"';
          start = j + 2;
          continue;
        }
        if (j > start) out += text.slice(start, j);
        pos = j + 1;
        break;
      }
      // A CR or an LF inside quotes is one LF in the value.
      if (j > start) out += text.slice(start, j);
      out += '\n';
      line += 1;
      start = j + 1;
      if (kind === 2 && text.charCodeAt(j + 1) === 10) start = j + 2;
    }
    if (pos >= n) return { value: out, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value: out, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value: out, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value: out, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(out);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // A plain record holds no quote and no CR before its line break, a CR
    // only as the last character of a CRLF ending: split it in place.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const qi = peekQuote(pos);
    const ri = peekCR(pos);
    const crlf = nl !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13;
    let fields;
    let quoted = false;
    if (
      (qi === -1 || qi >= lineEnd) &&
      (ri === -1 || ri >= lineEnd || (crlf && ri === lineEnd - 1))
    ) {
      const stop = crlf ? lineEnd - 1 : lineEnd;
      fields = [];
      let fs = pos;
      for (;;) {
        const c = text.indexOf(',', fs);
        if (c === -1 || c >= stop) {
          fields.push(text.slice(fs, stop));
          break;
        }
        fields.push(text.slice(fs, c));
        fs = c + 1;
      }
      pos = nl === -1 ? n : lineEnd + 1;
      if (nl !== -1) line += 1;
    } else {
      fields = [];
      let ended;
      do {
        quoted = text.charCodeAt(pos) === 34;
        const f = quoted ? readQuoted() : readUnquoted('');
        fields.push(f.value);
        ended = f.ended;
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
