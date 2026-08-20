export const MELI_API_ORIGIN = "https://api.mercadolibre.com";
export const MELI_AUTHORIZATION_ORIGIN = "https://auth.mercadolivre.com.br";

const ALLOWED_PATHS = [
  /^\/oauth\/token$/,
  /^\/users\/me$/,
  /^\/users\/\d+$/,
  /^\/sites\/MLB\/categories(?:\/all)?$/,
  /^\/sites\/MLB\/search$/,
  /^\/categories\/MLB\d+$/,
  /^\/items\/MLB\d+(?:\/sale_price|\/prices)?$/,
  /^\/items$/,
  /^\/highlights\/MLB\/category\/MLB\d+$/,
  /^\/user-products\/MLBU\d+$/,
  /^\/users\/\d+\/items\/search$/,
];

export function assertOfficialApiUrl(pathOrUrl: string): URL {
  const url = new URL(pathOrUrl, MELI_API_ORIGIN);
  if (url.origin !== MELI_API_ORIGIN) {
    throw new Error("Host externo ou não oficial rejeitado");
  }
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))) {
    throw new Error(`Endpoint não permitido: ${url.pathname}`);
  }
  return url;
}

export function assertMlbId(value: string, kind: "item" | "category"): string {
  const pattern = kind === "item" ? /^MLB\d+$/ : /^MLB\d+$/;
  if (!pattern.test(value)) throw new Error(`ID de ${kind} inválido`);
  return value;
}

export function assertSellerId(value: number | string): string {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) throw new Error("ID de seller inválido");
  return normalized;
}

export function assertUserProductId(value: string): string {
  if (!/^MLBU\d+$/.test(value)) throw new Error("ID de User Product inválido");
  return value;
}
