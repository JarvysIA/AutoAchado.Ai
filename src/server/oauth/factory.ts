import { getSupabaseServerClient } from "../supabase/client.js";
import { createMeliOAuthControlPlane } from "./control-plane.js";
import { loadMeliRotationConfig } from "./config.js";
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
