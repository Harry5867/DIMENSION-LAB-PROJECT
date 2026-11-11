import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFullName, validateStrongPassword } from '../server/auth-policy.js';

test('full-name policy accepts Vietnamese Unicode names and normalizes spacing', () => {
  assert.equal(validateFullName('  Nguyễn   Thị Minh Anh  '), 'Nguyễn Thị Minh Anh');
  assert.equal(validateFullName("Mary-Jane O'Neil"), "Mary-Jane O'Neil");
});

test('full-name policy rejects a single word and invalid punctuation', () => {
  assert.throws(() => validateFullName('Madonna'), /at least two name parts/);
  assert.throws(() => validateFullName('A B<script>'), /at least two name parts/);
});

test('strong password requires length, upper/lower case, number and symbol', () => {
  assert.equal(validateStrongPassword('Pineapple_Orbit_7'), true);
  assert.throws(() => validateStrongPassword('short!A1'), /at least 14 characters/);
  assert.throws(() => validateStrongPassword('pineapple_orbit_7'), /uppercase/);
  assert.throws(() => validateStrongPassword('PINEAPPLE_ORBIT_7'), /uppercase/);
  assert.throws(() => validateStrongPassword('Pineapple_OrbitX'), /number/);
  assert.equal(validateStrongPassword('PineappleOrbit_7'), true);
});

test('strong password rejects common phrases and long repeated sequences', () => {
  assert.throws(() => validateStrongPassword('PasswordPassword1!'), /less predictable/);
  assert.throws(() => validateStrongPassword('Aaaaaa12345678!'), /less predictable/);
});

