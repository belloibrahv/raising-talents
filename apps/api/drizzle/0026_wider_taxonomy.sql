-- A wider list for a worldwide audience (ADR-046): the 20 most played sports, 15 kinds of
-- musician, more of every other category, two new categories, and "Other" in each so nobody
-- is left without a choice. Slugs already in use keep their meaning.

UPDATE "taxonomy"."subcategories" SET "name" = 'Football (soccer)' WHERE "slug" = 'football';
--> statement-breakpoint
UPDATE "taxonomy"."subcategories" SET "name" = 'Athletics (track and field)' WHERE "slug" = 'athletics';
--> statement-breakpoint

INSERT INTO "taxonomy"."categories" ("slug", "name", "position") VALUES
  ('dance', 'Dance', 6),
  ('art-design', 'Art and design', 7)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

INSERT INTO "taxonomy"."subcategories" ("slug", "category_slug", "name", "position") VALUES
  ('cricket', 'sports', 'Cricket', 7),
  ('rugby', 'sports', 'Rugby', 8),
  ('american-football', 'sports', 'American football', 9),
  ('baseball', 'sports', 'Baseball', 10),
  ('golf', 'sports', 'Golf', 11),
  ('swimming', 'sports', 'Swimming', 12),
  ('table-tennis', 'sports', 'Table tennis', 13),
  ('badminton', 'sports', 'Badminton', 14),
  ('field-hockey', 'sports', 'Hockey', 15),
  ('ice-hockey', 'sports', 'Ice hockey', 16),
  ('cycling', 'sports', 'Cycling', 17),
  ('martial-arts', 'sports', 'Martial arts', 18),
  ('wrestling', 'sports', 'Wrestling', 19),
  ('gymnastics', 'sports', 'Gymnastics', 20),
  ('other-sport', 'sports', 'Other sport', 99),

  ('guitarist', 'music', 'Guitarist', 7),
  ('pianist', 'music', 'Pianist or keyboardist', 8),
  ('drummer', 'music', 'Drummer', 9),
  ('bassist', 'music', 'Bassist', 10),
  ('violinist', 'music', 'Violinist', 11),
  ('saxophonist', 'music', 'Saxophonist', 12),
  ('band', 'music', 'Band or group', 13),
  ('choir', 'music', 'Choir or vocal group', 14),
  ('composer', 'music', 'Composer', 15),
  ('other-music', 'music', 'Other music', 99),

  ('editorial-model', 'modelling', 'Editorial', 5),
  ('plus-size-model', 'modelling', 'Plus size', 6),
  ('promotional-model', 'modelling', 'Promotional', 7),
  ('parts-model', 'modelling', 'Hands and parts', 8),
  ('other-modelling', 'modelling', 'Other modelling', 99),

  ('commercial-actor', 'acting', 'Commercials', 5),
  ('musical-theatre-actor', 'acting', 'Musical theatre', 6),
  ('stunt-performer', 'acting', 'Stunts', 7),
  ('presenter', 'acting', 'Presenter or host', 8),
  ('other-acting', 'acting', 'Other acting', 99),

  ('fashion-creator', 'content-creation', 'Fashion', 6),
  ('food-creator', 'content-creation', 'Food', 7),
  ('travel-creator', 'content-creation', 'Travel', 8),
  ('fitness-creator', 'content-creation', 'Fitness', 9),
  ('tech-creator', 'content-creation', 'Tech', 10),
  ('music-creator', 'content-creation', 'Music and dance', 11),
  ('sports-creator', 'content-creation', 'Sports', 12),
  ('podcaster', 'content-creation', 'Podcasts', 13),
  ('other-creator', 'content-creation', 'Other content', 99),

  ('afro-dance', 'dance', 'Afro dance', 1),
  ('hip-hop-dance', 'dance', 'Hip-hop and street', 2),
  ('contemporary-dance', 'dance', 'Contemporary', 3),
  ('ballet', 'dance', 'Ballet', 4),
  ('ballroom-latin-dance', 'dance', 'Ballroom and Latin', 5),
  ('traditional-dance', 'dance', 'Traditional and cultural', 6),
  ('choreographer', 'dance', 'Choreographer', 7),
  ('other-dance', 'dance', 'Other dance', 99),

  ('photographer', 'art-design', 'Photographer', 1),
  ('filmmaker', 'art-design', 'Filmmaker', 2),
  ('painter', 'art-design', 'Painter', 3),
  ('illustrator', 'art-design', 'Illustrator', 4),
  ('graphic-designer', 'art-design', 'Graphic designer', 5),
  ('fashion-designer', 'art-design', 'Fashion designer', 6),
  ('makeup-artist', 'art-design', 'Makeup artist', 7),
  ('other-art', 'art-design', 'Other art and design', 99)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- Music styles are skills, so a singer can also be found as an Afrobeats or gospel act.
INSERT INTO "taxonomy"."skills" ("slug", "name", "category_slug") VALUES
  ('afrobeats', 'Afrobeats', 'music'),
  ('hip-hop', 'Hip-hop', 'music'),
  ('rnb', 'R&B and soul', 'music'),
  ('gospel', 'Gospel', 'music'),
  ('pop', 'Pop', 'music'),
  ('amapiano', 'Amapiano', 'music'),
  ('highlife', 'Highlife', 'music'),
  ('reggae-dancehall', 'Reggae and dancehall', 'music'),
  ('jazz', 'Jazz', 'music'),
  ('classical', 'Classical', 'music'),
  ('rock', 'Rock', 'music'),
  ('country', 'Country', 'music'),
  ('electronic', 'Electronic and dance', 'music'),
  ('latin', 'Latin', 'music'),
  ('k-pop', 'K-pop', 'music'),
  ('speed', 'Speed', 'sports'),
  ('strength', 'Strength', 'sports'),
  ('goalkeeping', 'Goalkeeping', 'sports'),
  ('defending', 'Defending', 'sports'),
  ('playmaking', 'Playmaking', 'sports'),
  ('finishing', 'Finishing and scoring', 'sports'),
  ('choreography', 'Choreography', 'dance'),
  ('freestyle', 'Freestyle', 'dance'),
  ('partner-work', 'Partner work', 'dance'),
  ('stage-performance', 'Stage performance', 'dance'),
  ('teaching-dance', 'Teaching', 'dance'),
  ('portraits', 'Portraits', 'art-design'),
  ('digital-art', 'Digital art', 'art-design'),
  ('branding', 'Branding', 'art-design'),
  ('styling', 'Styling', 'art-design'),
  ('video-production', 'Video production', 'art-design'),
  ('spanish', 'Spanish', NULL),
  ('portuguese', 'Portuguese', NULL),
  ('arabic', 'Arabic', NULL),
  ('mandarin', 'Mandarin', NULL),
  ('hindi', 'Hindi', NULL),
  ('swahili', 'Swahili', NULL),
  ('german', 'German', NULL),
  ('italian', 'Italian', NULL),
  ('japanese', 'Japanese', NULL),
  ('korean', 'Korean', NULL),
  ('russian', 'Russian', NULL),
  ('turkish', 'Turkish', NULL),
  ('dutch', 'Dutch', NULL),
  ('twi', 'Twi', NULL),
  ('zulu', 'Zulu', NULL),
  ('amharic', 'Amharic', NULL)
ON CONFLICT ("slug") DO NOTHING;
