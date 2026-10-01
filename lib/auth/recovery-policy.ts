// Client-safe recovery policy shared by the form, route, store and email copy.
export const RESET_PASSWORD_MIN_LENGTH = 12;
export const RESET_CODE_TTL_MINUTES = 10;
export const RESET_REQUEST_MESSAGE =
  "Request received. If this email has a password-based account, check its inbox and spam folder for a reset code. Delivery is not confirmed here.";
