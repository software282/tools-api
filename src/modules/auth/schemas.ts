import { z } from 'zod';

export const roleSchema = z.enum(['MEMBER', 'TEAM_ADMIN', 'SUPER_ADMIN']);

export const publicTeamSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  name: z.string(),
  inviteCode: z.string(),
  // Never the key itself — just whether the Claude fallback is usable for this team.
  anthropicApiKeyConfigured: z.boolean(),
});

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: roleSchema,
  teamId: z.string().nullable(),
});

export const authResultSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
  team: publicTeamSchema.nullable(),
});

export const createTeamBody = z.object({
  teamNumber: z.number().int().positive(),
  teamName: z.string().min(1).max(120),
});

// No token/user here — see the route's description for why. `warning` is
// carried in the payload itself (not just the docs) so no caller can miss it.
export const createTeamResponse = z.object({
  team: publicTeamSchema,
  warning: z.string(),
});

export const joinTeamBody = z.object({
  inviteCode: z.string().min(4).max(40),
  displayName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const meResponse = z.object({
  user: publicUserSchema,
  team: publicTeamSchema.nullable(),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const updateProfileBody = z.object({
  displayName: z.string().trim().min(1).max(80),
});
