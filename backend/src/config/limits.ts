import 'dotenv/config';

export function integerSetting(name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const setting = process.env[name];
  if (setting === undefined || setting === '') return fallback;
  const value = Number(setting);
  if (!/^\d+$/.test(setting) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error('Invalid integer setting: ' + name);
  }
  return value;
}

export const datasetLimits = {
  maxFiles: integerSetting('LAB_DATASET_MAX_FILES', 20, 1, 1000),
  maxBytes: integerSetting('LAB_DATASET_MAX_MIB', 30, 1, 1024 * 1024) * 1024 * 1024,
};
