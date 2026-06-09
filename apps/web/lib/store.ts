'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WaitlistEntryView } from '@joice/core';

interface WaitlistState {
  /** The user's own waitlist card, persisted so returning visitors see it again. */
  entry: WaitlistEntryView | null;
  setEntry: (entry: WaitlistEntryView) => void;
  reset: () => void;
}

export const useWaitlistStore = create<WaitlistState>()(
  persist(
    (set) => ({
      entry: null,
      setEntry: (entry) => set({ entry }),
      reset: () => set({ entry: null }),
    }),
    { name: 'joice-waitlist' },
  ),
);
