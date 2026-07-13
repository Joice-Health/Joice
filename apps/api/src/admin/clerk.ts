import { createClerkClient } from '@clerk/backend';
import { env } from '../env';

/** Shared Clerk Backend API client (admin-account management on /api/admin/admins). */
export const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
