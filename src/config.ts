export const DEFAULT_CLIENT_ID = "831976763519093";
export const DEFAULT_REDIRECT_URI =
  "https://autoachado-ai.vercel.app/auth/mercadolivre/callback";

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const clientId = env.MELI_CLIENT_ID?.trim();
  const clientSecret = env.MELI_CLIENT_SECRET?.trim();
  const redirectUri = env.MELI_REDIRECT_URI?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();

  const missing = [
    ["MELI_CLIENT_ID", clientId],
    ["MELI_CLIENT_SECRET", clientSecret],
    ["MELI_REDIRECT_URI", redirectUri],
    ["SESSION_SECRET", sessionSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  }
  if (clientId !== DEFAULT_CLIENT_ID) {
    throw new Error("MELI_CLIENT_ID não corresponde ao aplicativo autorizado");
  }
  if (redirectUri !== DEFAULT_REDIRECT_URI) {
    throw new Error("MELI_REDIRECT_URI não corresponde exatamente à URI cadastrada");
  }
  if ((sessionSecret?.length ?? 0) < 32) {
    throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres");
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    sessionSecret: sessionSecret!,
  };
}
