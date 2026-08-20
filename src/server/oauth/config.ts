import { DEFAULT_CLIENT_ID } from "../../config.js";

export const ROTATION_CONFIG_ERRORS = {
  expectedUserMissing: "CONFIG_MELI_EXPECTED_USER_ID_MISSING",
  expectedUserInvalid: "CONFIG_MELI_EXPECTED_USER_ID_INVALID",
  clientIdMissing: "CONFIG_MELI_CLIENT_ID_MISSING",
  clientIdInvalid: "CONFIG_MELI_CLIENT_ID_INVALID",
  clientSecretMissing: "CONFIG_MELI_CLIENT_SECRET_MISSING",
} as const;

export interface MeliRotationConfig {
  expectedUserId: number;
  clientId: string;
  clientSecret: string;
}

export function loadMeliRotationConfig(
  env: NodeJS.ProcessEnv = process.env,
): MeliRotationConfig {
  const rawExpectedUserId = env.MELI_EXPECTED_USER_ID?.trim();
  const clientId = env.MELI_CLIENT_ID?.trim();
  const clientSecret = env.MELI_CLIENT_SECRET?.trim();
  if (!rawExpectedUserId) throw new Error(ROTATION_CONFIG_ERRORS.expectedUserMissing);
  if (!/^\d+$/.test(rawExpectedUserId)) throw new Error(ROTATION_CONFIG_ERRORS.expectedUserInvalid);
  const expectedUserId = Number(rawExpectedUserId);
  if (!Number.isSafeInteger(expectedUserId) || expectedUserId <= 0) {
    throw new Error(ROTATION_CONFIG_ERRORS.expectedUserInvalid);
  }
  if (!clientId) throw new Error(ROTATION_CONFIG_ERRORS.clientIdMissing);
  if (clientId !== DEFAULT_CLIENT_ID) throw new Error(ROTATION_CONFIG_ERRORS.clientIdInvalid);
  if (!clientSecret) throw new Error(ROTATION_CONFIG_ERRORS.clientSecretMissing);
  return { expectedUserId, clientId, clientSecret };
}
