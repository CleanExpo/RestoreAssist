// Client-safe recovery policy shared by the form, route, store and email copy.
import { PASSWORD_MIN_LENGTH } from "./password-policy";

export const RESET_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;
export const RESET_CODE_TTL_MINUTES = 10;
export const RESET_REQUEST_MESSAGE =
  "Request received. If this email has a password-based account, check its inbox and spam folder for a reset code. Delivery is not confirmed here.";
