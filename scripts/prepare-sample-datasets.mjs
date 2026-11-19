import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('Provide the directory containing the original sample sources.');
const output = fileURLToPath(new URL('../public/samples/', import.meta.url));
const read = name => readFileSync(join(resolve(input), name), 'utf8');
const lines = value => value.trim().split(/\r?\n/).filter(line => line.trim());
const csvRows = value => lines(value).map(line => line.trim().split(','));

function labeledRows(rows, label) {
  return rows.map((row, index) => [index + 1, label(row.at(-1)), ...row.slice(0, -1)]);
}

// Take evenly-spaced source rows in each class, then restore source order.
function stratified(rows, perLabel, labelCount) {
  const groups = Map.groupBy(rows, row => row[1]);
  if (groups.size !== labelCount) throw new Error('Unexpected class count in source dataset.');
  return [...groups.values()].flatMap(group => {
    if (group.length < perLabel) throw new Error('Insufficient rows in a source class.');
    return Array.from({ length: perLabel }, (_, i) => group[Math.floor((i + 0.5) * group.length / perLabel)]);
  }).sort((a, b) => a[0] - b[0]);
}

const [penguinHeader, ...penguins] = csvRows(read('dimension-lab-source-penguins.csv'));
const penguinColumns = ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'island', 'sex'];
const penguinIndices = ['species', ...penguinColumns].map(name => {
  const index = penguinHeader.indexOf(name);
  if (index < 0) throw new Error(`Missing penguin source column ${name}.`);
  return index;
});
const penguinRows = penguins.map((row, index) => [index + 1, ...penguinIndices.map(i => row[i] === 'NA' ? '' : row[i])]);

const wheatRows = labeledRows(lines(read('dimension-lab-source-seeds.txt')).map(line => line.trim().split(/\s+/)),
  code => ({ 1: 'Kama', 2: 'Rosa', 3: 'Canadian' })[code]);
const banknoteRows = stratified(labeledRows(csvRows(read('dimension-lab-source-banknote.txt')),
  code => ({ 0: 'Genuine', 1: 'Forged' })[code]), 450, 2);

const harRead = name => lines(read('dimension-lab-har-' + name));
const activityNames = new Map(harRead('activity_labels.txt').map(line => line.trim().split(/\s+/)));
const harFeatures = harRead('features.txt').map(line => line.trim().split(/\s+/)[1]);
const sensorFeatures = ['tBodyAcc', 'tGravityAcc', 'tBodyAccJerk', 'tBodyGyro'].flatMap(sensor =>
  ['mean', 'std'].flatMap(stat => ['X', 'Y', 'Z'].map(axis => `${sensor}-${stat}()-${axis}`)));
const sensorIndices = sensorFeatures.map(name => {
  const index = harFeatures.indexOf(name);
  if (index < 0) throw new Error(`Missing sensor feature ${name}.`);
  return index;
});
const activityLabels = harRead('y_test.txt');
const activityRows = stratified(harRead('X_test.txt').map((line, index) => {
  const row = line.trim().split(/\s+/);
  const label = activityNames.get(activityLabels[index].trim());
  return [index + 1, label, ...sensorIndices.map(i => row[i])];
}), 100, 6);

const digitRows = stratified(labeledRows(csvRows(read('dimension-lab-source-digits.txt')), code => code), 90, 10);
const pixelNames = Array.from({ length: 64 }, (_, i) => `pixel_${Math.floor(i / 8) + 1}_${i % 8 + 1}`);

function save(filename, columns, rows, expectedRows) {
  const headers = ['id', 'label', ...columns];
  if (rows.length !== expectedRows || rows.some(row => row.length !== headers.length
    || row.some(value => value === undefined || /[,\r\n"]/.test(String(value))))) {
    throw new Error(`Unexpected values or row count in ${filename}.`);
  }
  writeFileSync(join(output, filename), [headers, ...rows].map(row => row.join(',')).join('\n') + '\n', 'utf8');
}

mkdirSync(output, { recursive: true });
save('palmer-penguins.csv', penguinColumns, penguinRows, 344);
save('wheat-seeds.csv', ['area', 'perimeter', 'compactness', 'kernel_length', 'kernel_width', 'asymmetry', 'groove_length'], wheatRows, 210);
save('banknote-authentication.csv', ['variance', 'skewness', 'curtosis', 'entropy'], banknoteRows, 900);
save('smartphone-activity.csv', sensorFeatures.map(name => name.replace('()', '').replaceAll('-', '_')), activityRows, 600);
save('handwritten-digits.csv', pixelNames, digitRows, 900);
