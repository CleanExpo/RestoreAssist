/// <reference types="vite/client" />

/**
 * Global type declarations for third-party integrations
 */

declare global {
  interface Window {
    /**
     * Google Identity Services (OAuth)
     * Used for Google One Tap and OAuth authentication
     */
    google?: {
      accounts?: {
        id?: {
          /**
           * Disables automatic sign-in for Google One Tap
           */
          disableAutoSelect(): void;
          /**
           * Cancels any pending Google One Tap prompts
           */
          cancel(): void;
          /**
           * Initializes Google One Tap with configuration
           */
          initialize?(config: {
            client_id: string;
            callback?: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }): void;
          /**
           * Renders the Google Sign-In button
           */
          renderButton?(
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number;
              locale?: string;
            }
          ): void;
          /**
           * Prompts the Google One Tap UI
           */
          prompt?(callback?: (notification: {
            isDisplayMoment(): boolean;
            isDisplayed(): boolean;
            isNotDisplayed(): boolean;
            getNotDisplayedReason(): string;
            isSkippedMoment(): boolean;
            getSkippedReason(): string;
            isDismissedMoment(): boolean;
            getDismissedReason(): string;
          }) => void): void;
        };
      };
    };
  }
}

export {};
