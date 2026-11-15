export const DEMO_EMAIL = 'demo@dimension.lab';
export const DEMO_PASSWORD = 'Dimension123!';

export function validDemoCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}
