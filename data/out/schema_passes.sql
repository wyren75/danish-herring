create table satellite_passes (
  site_code     text,
  site_label    text,
  mission       text,
  product_name  text primary key,
  acq_start     timestamptz,
  cloud_pct     double precision
);
create index on satellite_passes (site_code, mission, acq_start);
alter table satellite_passes enable row level security;
create policy "public read" on satellite_passes for select using (true);
