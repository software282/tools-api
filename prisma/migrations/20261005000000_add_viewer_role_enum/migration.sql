-- Split into its own migration on purpose: Postgres refuses to use a brand-new
-- enum value inside the same transaction that added it, and Prisma runs each
-- migration.sql as one transaction. The next migration (migrate_members_to_
-- viewer) is the one that actually assigns 'VIEWER' to any row, and it only
-- runs once this one has committed.
ALTER TYPE "Role" ADD VALUE 'VIEWER';
