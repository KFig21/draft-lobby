-- Add DRAFT_GRADE as a notification type, and TEAM as a target_type (a grade
-- targets a whole roster, not a specific pick/message).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'LOBBY_INVITE',
    'PICK_REACTION', 'MESSAGE_REACTION', 'PICK_REPLY', 'MENTION', 'DRAFT_GRADE'
  ));

-- The target_type check was added inline (auto-named), so find it dynamically
-- rather than guessing — matches whatever Postgres actually called it.
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and pg_get_constraintdef(oid) like '%target_type%';
  if con_name is not null then
    execute format('alter table public.notifications drop constraint %I', con_name);
  end if;
end $$;

alter table public.notifications add constraint notifications_target_type_check
  check (target_type in ('PICK', 'MESSAGE', 'TEAM'));
