-- Setup automated test match with 4 sections x 15 questions = 60 questions
delete from public.games where title = 'AUTOMATED_TEST_MATCH';

insert into public.games (id, game_code, title, creator_id, time_limit_seconds, status, grid_rows, grid_cols, grid_layout)
values (
  'a0000000-0000-0000-0000-000000000001',
  'TEST99',
  'AUTOMATED_TEST_MATCH',
  (select auth_user_id from public.mentors limit 1),
  3600,
  'active',
  15,
  15,
  '{"rows": 15, "cols": 15, "cellMask": []}'::jsonb
);

-- Section 1 (position 0)
insert into public.game_sections (id, game_id, name, position, time_limit_seconds, grid_rows, grid_cols, grid_layout)
values (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Section A',
  0,
  600,
  15,
  15,
  '{"rows": 15, "cols": 15, "cellMask": []}'::jsonb
);

-- Section 2 (position 1)
insert into public.game_sections (id, game_id, name, position, time_limit_seconds, grid_rows, grid_cols, grid_layout)
values (
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'Section B',
  1,
  600,
  15,
  15,
  '{"rows": 15, "cols": 15, "cellMask": []}'::jsonb
);

-- Section 3 (position 2)
insert into public.game_sections (id, game_id, name, position, time_limit_seconds, grid_rows, grid_cols, grid_layout)
values (
  'b0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Section C',
  2,
  600,
  15,
  15,
  '{"rows": 15, "cols": 15, "cellMask": []}'::jsonb
);

-- Section 4 (position 3)
insert into public.game_sections (id, game_id, name, position, time_limit_seconds, grid_rows, grid_cols, grid_layout)
values (
  'b0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'Section D',
  3,
  600,
  15,
  15,
  '{"rows": 15, "cols": 15, "cellMask": []}'::jsonb
);

-- Array of 15 alphabetic words
-- 1..15
with word_list as (
  select unnest(array[
    'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO',
    'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIET',
    'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR'
  ]) as word,
  generate_series(1, 15) as idx
)
insert into public.questions (id, game_id, section_id, direction, clue, answer, row_index, col_index, number)
select
  ('c0000000-0000-0000-0001-' || lpad(idx::text, 12, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'across'::public.clue_direction,
  'Section A Clue ' || idx,
  word,
  idx - 1,
  0,
  idx
from word_list;

with word_list as (
  select unnest(array[
    'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO',
    'UNIFORM', 'VICTOR', 'WHISKEY', 'XRAY', 'YANKEE',
    'ZULU', 'APPLE', 'BANANA', 'CHERRY', 'DRAGON'
  ]) as word,
  generate_series(1, 15) as idx
)
insert into public.questions (id, game_id, section_id, direction, clue, answer, row_index, col_index, number)
select
  ('c0000000-0000-0000-0002-' || lpad(idx::text, 12, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'b0000000-0000-0000-0000-000000000002'::uuid,
  'across'::public.clue_direction,
  'Section B Clue ' || idx,
  word,
  idx - 1,
  0,
  idx
from word_list;

with word_list as (
  select unnest(array[
    'EAGLE', 'FALCON', 'GIRAFFE', 'HAWK', 'IGUANA',
    'JAGUAR', 'KOALA', 'LEMUR', 'MONKEY', 'NEWT',
    'OTTER', 'PANDA', 'QUAIL', 'RABBIT', 'SNAKE'
  ]) as word,
  generate_series(1, 15) as idx
)
insert into public.questions (id, game_id, section_id, direction, clue, answer, row_index, col_index, number)
select
  ('c0000000-0000-0000-0003-' || lpad(idx::text, 12, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'b0000000-0000-0000-0000-000000000003'::uuid,
  'across'::public.clue_direction,
  'Section C Clue ' || idx,
  word,
  idx - 1,
  0,
  idx
from word_list;

with word_list as (
  select unnest(array[
    'TIGER', 'URCHIN', 'VIPER', 'WALRUS', 'ZEBRA',
    'BERRY', 'CITRUS', 'DATE', 'FIG', 'GRAPE',
    'LEMON', 'MANGO', 'MELON', 'ORANGE', 'PEACH'
  ]) as word,
  generate_series(1, 15) as idx
)
insert into public.questions (id, game_id, section_id, direction, clue, answer, row_index, col_index, number)
select
  ('c0000000-0000-0000-0004-' || lpad(idx::text, 12, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'b0000000-0000-0000-0000-000000000004'::uuid,
  'across'::public.clue_direction,
  'Section D Clue ' || idx,
  word,
  idx - 1,
  0,
  idx
from word_list;
