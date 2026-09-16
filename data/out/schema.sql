-- Supabase / Postgres schema matching the CSVs in out/
-- Import each CSV through the Supabase dashboard (Table editor -> Import).

create table scenes (
  scene_id      text primary key,
  product_name  text,
  acq_start     timestamptz,
  acq_end       timestamptz,
  acq_mid       timestamptz,
  site_code     text,
  bbox_w        double precision,
  bbox_s        double precision,
  bbox_e        double precision,
  bbox_n        double precision,
  n_positions          integer,
  n_vessels            integer,
  n_in_site            integer,
  n_fishing_in_site    integer,
  n_trawling_in_site   integer
);

create table vessels (
  mmsi          text primary key,
  name          text,
  imo           text,
  callsign      text,
  ship_type     text,
  length_m      double precision,
  width_m       double precision,
  mobile_class  text
);

create table positions (
  scene_id      text references scenes(scene_id),
  mmsi          text,
  t             timestamptz,
  lat           double precision,
  lon           double precision,
  sog           double precision,
  cog           double precision,
  heading       double precision,
  nav_status    text
);
create index on positions (scene_id, mmsi, t);

create table snapshots (
  scene_id      text references scenes(scene_id),
  mmsi          text,
  lat           double precision,
  lon           double precision,
  sog           double precision,
  cog           double precision,
  method        text,
  dt_before_s   integer,
  dt_after_s    integer
);
create index on snapshots (scene_id);

-- Read-only public access for the browser client
alter table scenes    enable row level security;
alter table vessels   enable row level security;
alter table positions enable row level security;
alter table snapshots enable row level security;
create policy "public read" on scenes    for select using (true);
create policy "public read" on vessels   for select using (true);
create policy "public read" on positions for select using (true);
create policy "public read" on snapshots for select using (true);
