// Demo UI access only; this is not a server authentication boundary.
export const DEMO_EMAIL = 'demo@dimension.lab';
export const DEMO_PASSWORD = 'Dimension123!';
const SESSION_KEY = 'dimension-lab-demo-session';
export function validDemoCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}
export function hasDemoSession() {
  try { return sessionStorage.getItem(SESSION_KEY) === 'demo'; } catch { return false; }
}
export function saveDemoSession() {
  try { sessionStorage.setItem(SESSION_KEY, 'demo'); } catch { /* Memory-only session remains usable. */ }
}
export function clearDemoSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

