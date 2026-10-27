-- Migration 0005_alert_cycle.sql
-- The alert key (entity_type, entity_id, kind, level) made an alert fire at most once per
-- application for its whole life, so after a stage change the next stage's reminders,
-- overdue alert and escalations could never fire. `cycle` scopes the key to one period:
-- the stage visit (stage_entered_at) for applications and the deadline (due_at) for
-- undertakings, which changes when rejected evidence reopens the undertaking. Other
-- entities keep an empty cycle, so a scheduler rerun still creates nothing new.

alter table alerts add column if not exists cycle text not null default '';

alter table alerts drop constraint if exists alerts_entity_type_entity_id_kind_level_key;

do $$ begin
  alter table alerts add constraint alerts_entity_kind_level_cycle_key
    unique (entity_type, entity_id, kind, level, cycle);
exception when duplicate_object then null; end $$;

-- Backfill so alerts already raised for the current period are not raised a second time.
-- The scheduler writes the cycle as whole epoch seconds.
update alerts al
   set cycle = floor(extract(epoch from a.stage_entered_at))::bigint::text
  from applications a
 where al.entity_type = 'application_stage'
   and al.entity_id = a.id
   and al.fired_at >= a.stage_entered_at
   and al.cycle = '';

update alerts al
   set cycle = floor(extract(epoch from u.due_at))::bigint::text
  from undertakings u
 where al.entity_type = 'undertaking'
   and al.entity_id = u.id
   and al.cycle = '';
