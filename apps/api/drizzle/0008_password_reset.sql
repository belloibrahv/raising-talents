ALTER TYPE "identity"."code_purpose" ADD VALUE 'password_reset';--> statement-breakpoint
ALTER TYPE "identity"."session_revoked_reason" ADD VALUE 'password_reset';