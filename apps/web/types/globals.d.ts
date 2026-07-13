export {};

declare global {
  /**
   * Custom claims added in Clerk Dashboard → Sessions → Customize session token:
   * `{ "metadata": "{{user.public_metadata}}", "email": "{{user.primary_email_address}}" }`
   */
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: 'admin';
    };
    email?: string;
  }
}
