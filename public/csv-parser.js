export function createCsvParser() {
  let field = '';
  let row = [];
  let quoted = false;
  let quotePending = false;
  let skipLineFeed = false;
  let firstCharacter = true;

  return {
    push(text, final = false) {
      const output = [];
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (firstCharacter) {
          firstCharacter = false;
          if (character === '\uFEFF') continue;
        }
        if (quotePending) {
          if (character === '"') {
            field += '"';
            quotePending = false;
            continue;
          }
          quotePending = false;
          quoted = false;
        }
        if (quoted) {
          if (character === '"') quotePending = true;
          else field += character;
          continue;
        }
        if (skipLineFeed) {
          skipLineFeed = false;
          if (character === '\n') continue;
        }
        if (character === '"') {
          quoted = true;
        } else if (character === ',') {
          row.push(field);
          field = '';
        } else if (character === '\r' || character === '\n') {
          row.push(field);
          if (row.some((value) => value !== '')) output.push(row);
          row = [];
          field = '';
          if (character === '\r') skipLineFeed = true;
        } else {
          field += character;
        }
      }
      if (final) {
        if (quotePending) {
          quotePending = false;
          quoted = false;
        }
        if (quoted) throw new Error('CSV ends before a quoted field closes.');
        if (field.length || row.length) {
          row.push(field);
          if (row.some((value) => value !== '')) output.push(row);
          row = [];
          field = '';
        }
      }
      return output;
    },
  };
}

export function uniqueHeaders(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 500) {
    throw new Error('CSV must contain between 1 and 500 columns.');
  }
  const seen = new Set();
  let warnings = 0;
  const columns = values.map((value, index) => {
    let name = String(value || '').trim() || ('column_' + (index + 1));
    const base = name.slice(0, 250);
    name = base;
    let suffix = 2;
    while (seen.has(name)) {
      name = base.slice(0, 240) + '_' + suffix;
      suffix += 1;
      warnings += 1;
    }
    seen.add(name);
    return name;
  });
  return { columns, warnings };
}

