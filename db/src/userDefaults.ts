/**
 * Id of the implicit default `users` row created by migration until multi-user auth exists.
 * API and jobs should scope portfolio-level data to this user for now.
 */
export const IMPLICIT_DEFAULT_USER_ID = 1 as const;
