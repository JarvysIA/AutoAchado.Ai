import type { UserDetail } from "../../meli/types.js";
import type { AuthorizationTokenResponse } from "../../oauth/client.js";
import { AuthorizationCodeExchangeError } from "../../oauth/client.js";
import { ControlPlaneError, type MeliOAuthControlPlane } from "./control-plane.js";

export type InitialAuthorizationOutcome =
  | "AUTHORIZED_AND_STORED"
  | "REAUTHORIZED_AND_STORED"
  | "AUTHORIZATION_ALREADY_ACTIVE"
  | "LOCK_BUSY"
  | "STATE_NOT_ALLOWED"
  | "TOKEN_EXCHANGE_FAILED"
  | "TOKEN_RESPONSE_INVALID"
  | "USER_VALIDATION_FAILED"
  | "USER_MISMATCH"
  | "CONTROL_PLANE_FAILED"
  | "OUTCOME_UNKNOWN"
  | "CONFIG_ERROR";

export interface InitialAuthorizationResult {
  outcome: InitialAuthorizationOutcome;
  externalUserId?: number;
  tokenVersion?: number;
  sanitizedErrorCode?: string;
}

export interface InitialAuthorizationDependencies {
  exchangeCode(code: string, verifier: string): Promise<AuthorizationTokenResponse>;
  getCurrentUser(accessToken: string): Promise<UserDetail>;
  controlPlane: MeliOAuthControlPlane;
  expectedUserId: number;
}

export class InitialAuthorizationService {
  constructor(private readonly dependencies: InitialAuthorizationDependencies) {
    if (!Number.isSafeInteger(dependencies.expectedUserId) || dependencies.expectedUserId <= 0) {
      throw new Error("CONFIG_MELI_EXPECTED_USER_ID_INVALID");
    }
  }

  async authorize(code: string, verifier: string): Promise<InitialAuthorizationResult> {
    let token: AuthorizationTokenResponse;
    try {
      token = await this.dependencies.exchangeCode(code, verifier);
    } catch (error) {
      if (error instanceof AuthorizationCodeExchangeError) {
        return { outcome: error.outcome, sanitizedErrorCode: error.sanitizedCode };
      }
      return { outcome: "OUTCOME_UNKNOWN", sanitizedErrorCode: "AUTHORIZATION_CODE_OUTCOME_UNKNOWN" };
    }

    if (token.userId !== this.dependencies.expectedUserId) {
      return { outcome: "USER_MISMATCH", sanitizedErrorCode: "TOKEN_USER_MISMATCH" };
    }

    let user: UserDetail;
    try {
      user = await this.dependencies.getCurrentUser(token.accessToken);
    } catch {
      return { outcome: "USER_VALIDATION_FAILED", sanitizedErrorCode: "USERS_ME_FAILED" };
    }
    if (!Number.isSafeInteger(user.id) || user.id <= 0) {
      return { outcome: "USER_VALIDATION_FAILED", sanitizedErrorCode: "USERS_ME_RESPONSE_INVALID" };
    }
    if (user.id !== token.userId || user.id !== this.dependencies.expectedUserId) {
      return { outcome: "USER_MISMATCH", sanitizedErrorCode: "USERS_ME_USER_MISMATCH" };
    }

    try {
      const initialized = await this.dependencies.controlPlane.initializeConnection(user.id, token.refreshToken);
      const common = { externalUserId: user.id, tokenVersion: initialized.tokenVersion };
      switch (initialized.outcome) {
        case "INITIALIZED": return { outcome: "AUTHORIZED_AND_STORED", ...common };
        case "REAUTHORIZED": return { outcome: "REAUTHORIZED_AND_STORED", ...common };
        case "ALREADY_INITIALIZED": return { outcome: "AUTHORIZATION_ALREADY_ACTIVE", ...common };
        case "LOCK_BUSY": return { outcome: "LOCK_BUSY", ...common };
        case "STATE_NOT_ALLOWED": return { outcome: "STATE_NOT_ALLOWED", ...common };
      }
    } catch (error) {
      if (error instanceof ControlPlaneError && error.transportAmbiguous) {
        return { outcome: "OUTCOME_UNKNOWN", sanitizedErrorCode: "CONTROL_PLANE_OUTCOME_UNKNOWN" };
      }
      return { outcome: "CONTROL_PLANE_FAILED", sanitizedErrorCode: "CONTROL_PLANE_FAILED" };
    }
  }
}
