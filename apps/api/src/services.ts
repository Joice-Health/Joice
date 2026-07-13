import { getDatabase } from '@joice/db';
import {
  createAdminWaitlistService,
  createAuditService,
  createFeatureFlagService,
  createSettingsService,
  createUserService,
  createWaitlistService,
} from '@joice/core';

/** Single service graph over the shared DB client, reused across routes. */
const db = getDatabase();

export const waitlist = createWaitlistService(db);
export const audit = createAuditService(db);
export const adminWaitlist = createAdminWaitlistService(db, audit);
export const userService = createUserService(db, audit);
export const featureFlags = createFeatureFlagService(db, audit);
export const settings = createSettingsService(db, audit);
