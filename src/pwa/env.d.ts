// Build settings this workstream reads. (Interfaces merge with the ones in src/vite-env.d.ts.)

interface ImportMetaEnv {
  /**
   * The public half of the VAPID key pair that signs our push messages. Safe to ship.
   * Empty until notifications are set up (supabase/functions/push/README.md).
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

/** Chrome's offer to install the app. Not in TypeScript's own list of events yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}
