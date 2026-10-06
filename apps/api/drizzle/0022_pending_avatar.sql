ALTER TABLE "talent"."profiles" ADD COLUMN "pending_avatar_media_id" uuid;--> statement-breakpoint
-- ADR-044 backfill: talent whose photo was already waiting for a moderator before this change.
UPDATE "talent"."profiles" AS p SET "pending_avatar_media_id" = held.id
FROM (
  SELECT DISTINCT ON (a."owner_id") a."owner_id", a."id"
  FROM "media"."assets" AS a
  WHERE a."purpose" = 'avatar' AND a."status" = 'held_for_review'
  ORDER BY a."owner_id", a."created_at" DESC
) AS held
WHERE held."owner_id" = p."user_id" AND p."avatar_media_id" IS NULL;--> statement-breakpoint
-- Every step done and a photo waiting: they finish onboarding now instead of waiting for a moderator.
UPDATE "accounts"."users" AS u SET "status" = 'active', "role_locked_at" = now(), "updated_at" = now()
FROM "talent"."profiles" AS p
WHERE p."user_id" = u."id"
  AND u."status" = 'onboarding'
  AND u."role" = 'talent'
  AND p."pending_avatar_media_id" IS NOT NULL
  AND p."display_name" IS NOT NULL
  AND p."category_slug" IS NOT NULL
  AND p."city_slug" IS NOT NULL
  AND length(p."bio") >= 50
  AND EXISTS (SELECT 1 FROM "talent"."profile_subcategories" AS s WHERE s."user_id" = p."user_id");
