import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsvParser, uniqueHeaders } from '../public/csv-parser.js';

test('CSV parser handles CRLF, commas, escaped quotes and multiline fields split across chunks', () => {
  const parser = createCsvParser();
  const first = parser.push('\uFEFFname,description\r\nAlice,"one, ');
  const second = parser.push('two ""quoted"" lines\r\nand a newline",ok\r\n');
  const last = parser.push('Bob,plain,done', true);
  assert.deepEqual(first, [['name', 'description']]);
  assert.deepEqual(second, [['Alice', 'one, two "quoted" lines\r\nand a newline', 'ok']]);
  assert.deepEqual(last, [['Bob', 'plain', 'done']]);
});

test('CSV parser preserves empty trailing columns and ignores blank lines', () => {
  const parser = createCsvParser();
  assert.deepEqual(parser.push('a,b,\n\n1,2,\n', true), [['a', 'b', ''], ['1', '2', '']]);
});

test('CSV parser reports an unterminated quoted field', () => {
  const parser = createCsvParser();
  assert.throws(() => parser.push('a,"unfinished', true), /quoted field closes/);
});

test('duplicate or empty headers become stable unique field names with a warning count', () => {
  assert.deepEqual(uniqueHeaders([' id ', 'id', '', 'label']), {
    columns: ['id', 'id_2', 'column_3', 'label'],
    warnings: 1,
  });
});

