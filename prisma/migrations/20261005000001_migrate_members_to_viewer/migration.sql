-- New permission model: a team's non-admin members become read-only VIEWERs
-- instead of full-editing MEMBERs. TEAM_ADMIN is now the only role that can
-- write team data (parts, inventory, receipts, team settings — see the
-- requireTeamAdmin preHandler now on those write routes). MEMBER stays in the
-- enum (Postgres has no ALTER TYPE ... DROP VALUE short of recreating the
-- whole type) but nothing creates it anymore after this migration.

-- Every existing team member who wasn't already an admin was functionally a
-- "member" under the old model (full edit rights). Under the new model, a
-- regular member is read-only by default — relabel them VIEWER so the roster
-- UI and this comment are the only places that ever need to mention the old
-- meaning. Teamless MEMBER rows (shouldn't exist — see User.teamId's comment)
-- are left untouched: nothing in this app reads a teamless account's role, so
-- there's nothing to gain from guessing at one.
UPDATE "User" SET role = 'VIEWER' WHERE role = 'MEMBER' AND "teamId" IS NOT NULL;

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
