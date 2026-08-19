import { clerkClient } from '../admin/clerk';
import { userService } from '../services';
import { createRequireMember } from './auth';

/** The member middleware wired to the real user service and Clerk backend client. */
export const requireMember = createRequireMember({
  users: userService,
  clerk: {
    getUser: (id) => clerkClient.users.getUser(id),
    updateUserMetadata: (id, input) => clerkClient.users.updateUserMetadata(id, input),
  },
});
