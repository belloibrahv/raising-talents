CREATE SCHEMA "taxonomy";
--> statement-breakpoint
CREATE SCHEMA "talent";
--> statement-breakpoint
CREATE SCHEMA "agent";
--> statement-breakpoint
CREATE TYPE "talent"."gender" AS ENUM('female', 'male', 'non_binary');--> statement-breakpoint
CREATE TABLE "taxonomy"."categories" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy"."cities" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy"."skills" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_slug" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy"."subcategories" (
	"slug" text PRIMARY KEY NOT NULL,
	"category_slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent"."profile_skills" (
	"user_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "profile_skills_user_id_skill_slug_pk" PRIMARY KEY("user_id","skill_slug")
);
--> statement-breakpoint
CREATE TABLE "talent"."profile_subcategories" (
	"user_id" uuid NOT NULL,
	"subcategory_slug" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "profile_subcategories_user_id_subcategory_slug_pk" PRIMARY KEY("user_id","subcategory_slug")
);
--> statement-breakpoint
CREATE TABLE "talent"."profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"bio" text DEFAULT '' NOT NULL,
	"category_slug" text,
	"city_slug" text,
	"gender" "talent"."gender",
	"gender_searchable" boolean DEFAULT false NOT NULL,
	"avatar_media_id" uuid,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent"."profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"agency_name" text,
	"job_title" text,
	"city_slug" text,
	"website" text,
	"completed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent"."profile_specializations" (
	"user_id" uuid NOT NULL,
	"category_slug" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "profile_specializations_user_id_category_slug_pk" PRIMARY KEY("user_id","category_slug")
);
--> statement-breakpoint
ALTER TABLE "taxonomy"."skills" ADD CONSTRAINT "skills_category_slug_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "taxonomy"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy"."subcategories" ADD CONSTRAINT "subcategories_category_slug_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "taxonomy"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent"."profile_skills" ADD CONSTRAINT "profile_skills_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "talent"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent"."profile_skills" ADD CONSTRAINT "profile_skills_skill_slug_skills_slug_fk" FOREIGN KEY ("skill_slug") REFERENCES "taxonomy"."skills"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent"."profile_subcategories" ADD CONSTRAINT "profile_subcategories_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "talent"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent"."profile_subcategories" ADD CONSTRAINT "profile_subcategories_subcategory_slug_subcategories_slug_fk" FOREIGN KEY ("subcategory_slug") REFERENCES "taxonomy"."subcategories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent"."profiles" ADD CONSTRAINT "profiles_category_slug_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "taxonomy"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent"."profiles" ADD CONSTRAINT "profiles_city_slug_cities_slug_fk" FOREIGN KEY ("city_slug") REFERENCES "taxonomy"."cities"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent"."profiles" ADD CONSTRAINT "profiles_city_slug_cities_slug_fk" FOREIGN KEY ("city_slug") REFERENCES "taxonomy"."cities"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent"."profile_specializations" ADD CONSTRAINT "profile_specializations_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "agent"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent"."profile_specializations" ADD CONSTRAINT "profile_specializations_category_slug_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "taxonomy"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subcategories_category_idx" ON "taxonomy"."subcategories" USING btree ("category_slug");--> statement-breakpoint
CREATE INDEX "profile_skills_slug_idx" ON "talent"."profile_skills" USING btree ("skill_slug");--> statement-breakpoint
CREATE INDEX "profile_subcategories_slug_idx" ON "talent"."profile_subcategories" USING btree ("subcategory_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_unique" ON "talent"."profiles" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "profiles_complete_category_idx" ON "talent"."profiles" USING btree ("category_slug") WHERE is_complete;--> statement-breakpoint
CREATE INDEX "profile_specializations_category_idx" ON "agent"."profile_specializations" USING btree ("category_slug");