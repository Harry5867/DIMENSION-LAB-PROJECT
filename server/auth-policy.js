function policyError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function validateFullName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw policyError('Full name is required and must be at most 120 characters.');
  }
  const name = value.trim().replace(/\s+/g, ' ');
  const parts = name.split(' ');
  if (parts.length < 2 || name.length < 5
      || parts.some((part) => !/^[\p{L}\p{M}][\p{L}\p{M}.'’\-]*$/u.test(part))) {
    throw policyError('Enter your full name using at least two name parts.');
  }
  return name;
}

export function validateStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256
      || !/\p{Lu}/u.test(password)
      || !/\p{Ll}/u.test(password)
      || !/\p{N}/u.test(password)
      || !/[^\p{L}\p{N}\s]/u.test(password)) {
    throw policyError('Use at least 14 characters with uppercase, lowercase, a number, and a symbol.');
  }
  const normalized = password.toLowerCase();
  if (/(.)\1{4,}/u.test(password)
      || /^(123456|abcdef|qwerty|letmein)/i.test(password)
      || ['password', 'dimensionlab', 'iloveyou'].some((part) => normalized.includes(part))) {
    throw policyError('Choose a less predictable password; avoid common words and repeated characters.');
  }
  return true;
}

