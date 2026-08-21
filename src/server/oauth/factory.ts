import { getSupabaseServerClient } from "../supabase/client.js";
import type { AppConfig } from "../../config.js";
import { MeliClient } from "../../meli/client.js";
import type { UserDetail } from "../../meli/types.js";
import { exchangeAuthorizationCode } from "../../oauth/client.js";
import { createMeliOAuthControlPlane } from "./control-plane.js";
import { loadMeliRotationConfig } from "./config.js";
import { InitialAuthorizationService } from "./initial-authorization.js";
import { MeliOAuthRotationService } from "./rotation-service.js";
import { MeliHttpTokenProvider } from "./token-provider.js";

export function createMeliOAuthRotationService(): MeliOAuthRotationService {
  const config = loadMeliRotationConfig();
  return new MeliOAuthRotationService({
    controlPlane: createMeliOAuthControlPlane(getSupabaseServerClient()),
    tokenProvider: new MeliHttpTokenProvider({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }),
    expectedUserId: config.expectedUserId,
  });
}

export function createMeliInitialAuthorizationService(config: AppConfig): InitialAuthorizationService {
  const rotationConfig = loadMeliRotationConfig();
  return new InitialAuthorizationService({
    expectedUserId: rotationConfig.expectedUserId,
    controlPlane: createMeliOAuthControlPlane(getSupabaseServerClient()),
    exchangeCode: (code, verifier) => exchangeAuthorizationCode(config, code, verifier),
    getCurrentUser: async (accessToken) => {
      const response = await new MeliClient({ accessToken }).get<UserDetail>("/users/me");
      if (response.status !== 200 || !response.data) throw new Error("USERS_ME_FAILED");
      return response.data;
    },
  });
}
