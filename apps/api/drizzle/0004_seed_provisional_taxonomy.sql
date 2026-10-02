-- Provisional launch taxonomy, built from the five talent types in the PRD.
-- The final list is open client question 8 (design section 21). Changing it means
-- a new migration that inserts, renames or retires rows (active = false); slugs
-- are never reused, because profiles refer to them.

INSERT INTO "taxonomy"."categories" ("slug", "name", "position") VALUES
  ('sports', 'Sports', 1),
  ('music', 'Music', 2),
  ('modelling', 'Modelling', 3),
  ('acting', 'Acting', 4),
  ('content-creation', 'Content creation', 5)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

INSERT INTO "taxonomy"."subcategories" ("slug", "category_slug", "name", "position") VALUES
  ('football', 'sports', 'Football', 1),
  ('basketball', 'sports', 'Basketball', 2),
  ('athletics', 'sports', 'Athletics', 3),
  ('boxing', 'sports', 'Boxing', 4),
  ('tennis', 'sports', 'Tennis', 5),
  ('volleyball', 'sports', 'Volleyball', 6),
  ('singer', 'music', 'Singer', 1),
  ('rapper', 'music', 'Rapper', 2),
  ('instrumentalist', 'music', 'Instrumentalist', 3),
  ('music-producer', 'music', 'Producer', 4),
  ('dj', 'music', 'DJ', 5),
  ('songwriter', 'music', 'Songwriter', 6),
  ('fashion-model', 'modelling', 'Fashion', 1),
  ('commercial-model', 'modelling', 'Commercial', 2),
  ('runway-model', 'modelling', 'Runway', 3),
  ('fitness-model', 'modelling', 'Fitness', 4),
  ('film-actor', 'acting', 'Film', 1),
  ('television-actor', 'acting', 'Television', 2),
  ('stage-actor', 'acting', 'Stage', 3),
  ('voice-actor', 'acting', 'Voice', 4),
  ('comedy-creator', 'content-creation', 'Comedy', 1),
  ('lifestyle-creator', 'content-creation', 'Lifestyle', 2),
  ('beauty-creator', 'content-creation', 'Beauty', 3),
  ('gaming-creator', 'content-creation', 'Gaming', 4),
  ('education-creator', 'content-creation', 'Education', 5)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- Skills with no category apply to every category: languages matter for actors and musicians alike.
INSERT INTO "taxonomy"."skills" ("slug", "name", "category_slug") VALUES
  ('sprinting', 'Sprinting', 'sports'),
  ('ball-control', 'Ball control', 'sports'),
  ('set-pieces', 'Set pieces', 'sports'),
  ('endurance', 'Endurance', 'sports'),
  ('team-leadership', 'Team leadership', 'sports'),
  ('vocals', 'Vocals', 'music'),
  ('live-performance', 'Live performance', 'music'),
  ('songwriting', 'Songwriting', 'music'),
  ('beat-making', 'Beat making', 'music'),
  ('piano', 'Piano', 'music'),
  ('guitar', 'Guitar', 'music'),
  ('drums', 'Drums', 'music'),
  ('runway-walk', 'Runway walk', 'modelling'),
  ('posing', 'Posing', 'modelling'),
  ('editorial', 'Editorial', 'modelling'),
  ('improvisation', 'Improvisation', 'acting'),
  ('stage-combat', 'Stage combat', 'acting'),
  ('accents', 'Accents', 'acting'),
  ('voice-over', 'Voice-over', 'acting'),
  ('video-editing', 'Video editing', 'content-creation'),
  ('scriptwriting', 'Scriptwriting', 'content-creation'),
  ('on-camera-presenting', 'On-camera presenting', 'content-creation'),
  ('english', 'English', NULL),
  ('yoruba', 'Yoruba', NULL),
  ('igbo', 'Igbo', NULL),
  ('hausa', 'Hausa', NULL),
  ('nigerian-pidgin', 'Nigerian Pidgin', NULL),
  ('french', 'French', NULL)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- City centres only (latitude, longitude). Never used to locate a person more precisely than the city.
INSERT INTO "taxonomy"."cities" ("slug", "name", "country_code", "latitude", "longitude") VALUES
  ('ng-lagos', 'Lagos', 'NG', 6.5244, 3.3792),
  ('ng-abuja', 'Abuja', 'NG', 9.0765, 7.3986),
  ('ng-port-harcourt', 'Port Harcourt', 'NG', 4.8156, 7.0498),
  ('ng-ibadan', 'Ibadan', 'NG', 7.3775, 3.9470),
  ('ng-kano', 'Kano', 'NG', 12.0022, 8.5920),
  ('ng-enugu', 'Enugu', 'NG', 6.4584, 7.5464),
  ('ng-benin-city', 'Benin City', 'NG', 6.3350, 5.6037),
  ('ng-kaduna', 'Kaduna', 'NG', 10.5105, 7.4165),
  ('ng-abeokuta', 'Abeokuta', 'NG', 7.1475, 3.3619),
  ('ng-owerri', 'Owerri', 'NG', 5.4840, 7.0351),
  ('ng-jos', 'Jos', 'NG', 9.8965, 8.8583),
  ('ng-calabar', 'Calabar', 'NG', 4.9757, 8.3417),
  ('ng-uyo', 'Uyo', 'NG', 5.0377, 7.9128),
  ('ng-ilorin', 'Ilorin', 'NG', 8.4966, 4.5426),
  ('ng-warri', 'Warri', 'NG', 5.5160, 5.7500)
ON CONFLICT ("slug") DO NOTHING;
