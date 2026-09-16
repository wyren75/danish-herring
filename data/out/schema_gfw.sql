create table gfw_fishing_events (
  event_id       text primary key,
  start          timestamptz,
  "end"          timestamptz,
  lat            double precision,
  lon            double precision,
  bbox_w         double precision,
  bbox_s         double precision,
  bbox_e         double precision,
  bbox_n         double precision,
  inside_site    boolean,
  mmsi           text,
  vessel_name    text,
  flag           text,
  gfw_vessel_id  text,
  avg_speed_kn   double precision,
  distance_km    double precision,
  dist_port_km   double precision,
  dist_shore_km  double precision,
  mpa_tags       text,
  site_code      text
);
create index on gfw_fishing_events (start);
create index on gfw_fishing_events (inside_site);
alter table gfw_fishing_events enable row level security;
create policy "public read" on gfw_fishing_events for select using (true);
