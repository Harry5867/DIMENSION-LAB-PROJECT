export const DEMO_EMAIL = 'demo@dimension.lab';
export const DEMO_PASSWORD = 'Dimension123!';
const SESSION_KEY = 'dimension-lab-workspace-session';
const OFFLINE_SESSION = 'offline';
let activeSession: string | null = null;
export function validDemoCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}
export function hasDemoSession() {
  return readSession() !== null;
}
function readSession() {
  try { return activeSession ?? sessionStorage.getItem(SESSION_KEY); } catch { return activeSession; }
}
export function getAccessToken() {
  const session = readSession();
  return session === OFFLINE_SESSION ? null : session;
}
export function saveDemoSession(token: string | null) {
  activeSession = token ?? OFFLINE_SESSION;
  try { sessionStorage.setItem(SESSION_KEY, activeSession); } catch { /* Memory-only session remains usable. */ }
}
export function clearDemoSession() {
  activeSession = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

