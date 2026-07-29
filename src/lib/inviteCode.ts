import { customAlphabet } from 'nanoid';

/**
 * Invite codes get read aloud across a workshop, so the alphabet omits
 * characters that are easily confused when spoken or handwritten (0/O, 1/I/L).
 */
export const makeInviteCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 8);
