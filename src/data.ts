// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>

import type { IpData } from './types';

async function json<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`${path} — HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The world boundaries are ~240 KB and only two of the nine views need them,
 * so they load lazily rather than blocking first paint.
 */
let worldPromise: Promise<unknown> | null = null;
export function loadWorld(): Promise<unknown> {
  if (!worldPromise) {
    worldPromise = fetch('data/world.geojson').then((r) => {
      if (!r.ok) throw new Error(`world.geojson — HTTP ${r.status}`);
      return r.json();
    });
  }
  return worldPromise;
}

let statesPromise: Promise<unknown> | null = null;
export function loadStateShapes(): Promise<unknown> {
  if (!statesPromise) {
    statesPromise = fetch('data/au-states.geojson').then((r) => {
      if (!r.ok) throw new Error(`au-states.geojson — HTTP ${r.status}`);
      return r.json();
    });
  }
  return statesPromise;
}

export async function loadData(signal: AbortSignal): Promise<IpData> {
  const [core, origin, tech, filers, firms, brands, states] = await Promise.all([
    json<IpData['core']>('data/core.json', signal),
    json<IpData['origin']>('data/origin.json', signal),
    json<IpData['tech']>('data/tech.json', signal),
    json<{ filers: IpData['filers'] }>('data/filers.json', signal),
    json<{ firms: IpData['firms'] }>('data/attorneys.json', signal),
    json<IpData['brands']>('data/brands.json', signal),
    json<IpData['states']>('data/states.json', signal),
  ]);
  return { core, origin, tech, filers: filers.filers, firms: firms.firms, brands, states };
}
