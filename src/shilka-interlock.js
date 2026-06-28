// ЗСУ-23-4 «Шилка» — fire-permission AND-chain (ЦЕПЬ СТРЕЛЬБЫ interlocks).
//
// Pure logic, no THREE / no DOM — node-testable, reused by demoshilka + the game.
// canFire(s) collects every failed condition into blockedBy[] so the UI can show
// WHY the guns won't fire; ok === (blockedBy.length === 0).
//
// Sources: subsystem-states §7 · findings/07 p.37 (ЦЕПЬ СТРЕЛЬБЫ schematic, series
// interlocks ЛЮК/ОХЛ/Уровень ОЖ/КБЛ/СРП) · findings/08 p.89 (ЕСТЬ ДАННЫЕ modes 1-3) ·
// findings/03 p.38-40 (АВАРИЙНАЯ bypasses limiter+data but NOT hatch+cooling).

export function createFireState(overrides = {}) {
  return Object.assign({
    hatchClosed: true,    // ЛЮК ОТКРЫТ off — hard, АВАРИЙНАЯ does NOT bypass
    cooling: false,       // ОХЛАЖДЕНИЕ pump running — hard, АВАРИЙНАЯ does NOT bypass
    elevationDeg: 0,      // current gun elevation
    angleLimit: 0,        // ОГРАНИЧЕНИЕ УГЛОВ floor (0/5/.../40°)
    dataPresent: false,   // ЕСТЬ ДАННЫЕ (СРП solution valid) — required in radar modes 1-3
    radarMode: 1,         // 1-3 = radar/auto (needs data), 4-5 = optical/manual (no data)
    tsepFire: false,      // ЦЕПЬ СТРЕЛЬБЫ master toggle
    bankUpper: false,     // СТРЕЛЬБА ВЕРХНИХ АВТ
    bankLower: false,     // СТРЕЛЬБА НИЖНИХ АВТ
    station: null,        // КОМАНДИР-ОПЕРАТОР: 'cmd' | 'op' | null
    avariynaya: false,    // АВАРИЙНАЯ СТРЕЛЬБА (sealed override)
    gagReady: false,      // ГАГ ОТСТОПОРЕНО (from shilka-stab.gagReady)
    onMove: false,        // vehicle moving (fire-on-move needs gagReady)
  }, overrides);
}

// Returns { ok, blockedBy }. Order of checks = order reasons appear.
export function canFire(s) {
  const blockedBy = [];

  // Hard interlocks — АВАРИЙНАЯ never bypasses these.
  if (!s.hatchClosed) blockedBy.push('ЛЮК ОТКРЫТ');
  if (!s.cooling) blockedBy.push('ОХЛАЖДЕНИЕ off');

  // Master firing circuit + bank selection + station.
  if (!s.tsepFire) blockedBy.push('ЦЕПЬ СТРЕЛЬБЫ off');
  if (!(s.bankUpper || s.bankLower)) blockedBy.push('žádná banka (ВЕРХ/НИЖ)');
  if (!s.station) blockedBy.push('stanice nevolena (КОМАНДИР-ОПЕРАТОР)');

  // Bypassable by АВАРИЙНАЯ: angle floor + data-present.
  if (!s.avariynaya && s.elevationDeg < s.angleLimit) blockedBy.push('pod ОГРАНИЧЕНИЕ УГЛОВ');
  if (!s.avariynaya && s.radarMode <= 3 && !s.dataPresent) blockedBy.push('ЕСТЬ ДАННЫЕ chybí');

  // Fire-on-move needs stabilization (independent of АВАРИЙНАЯ).
  if (s.onMove && !s.gagReady) blockedBy.push('jen z místa (ГАГ není ОТСТОПОРЕНО)');

  return { ok: blockedBy.length === 0, blockedBy };
}
