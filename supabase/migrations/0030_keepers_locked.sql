-- Commissioner-toggleable lock: when on, owners can no longer keep/unkeep
-- offered candidates (the commissioner still can, on anyone's behalf) —
-- meant to be flipped on right before Start so the board is guaranteed
-- stable once the draft actually begins. Same "flip live in the room" shape
-- as team_names_locked (0026).
alter table public.lobbies
  add column keepers_locked boolean not null default false;
