import { describe, expect, it } from 'vitest';
import { createRoundSession } from '../../src/game/session';
import {
  clearRoundSession,
  clearSavedSession,
  getSaveSlotInfo,
  hasSavedSession,
  loadRoundSession,
  loadSession,
  ROUND_SESSION_KEY,
  saveRoundSession,
  saveSession,
} from '../../src/game/storage';
import { GAME_SESSION_SCHEMA_VERSION } from '../../src/game/types';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('local round persistence (SaveSystem)', () => {
  it('round-trips a v2 session and exposes SaveSlotInfo helpers', () => {
    const storage = memoryStorage();
    expect(hasSavedSession(storage)).toBe(false);
    expect(getSaveSlotInfo(storage).hasSave).toBe(false);

    const session = createRoundSession(99);
    saveSession(session, storage);

    expect(hasSavedSession(storage)).toBe(true);
    const slot = getSaveSlotInfo(storage);
    expect(slot.hasSave).toBe(true);
    expect(slot.schemaVersion).toBe(GAME_SESSION_SCHEMA_VERSION);
    expect(slot.planetId).toBe('zephyr-7');

    expect(loadSession(storage)).toEqual(session);

    clearSavedSession(storage);
    expect(hasSavedSession(storage)).toBe(false);
  });

  it('ignores malformed or unrelated saved values', () => {
    const storage = memoryStorage();
    storage.setItem(ROUND_SESSION_KEY, '{bad json');
    expect(loadRoundSession(storage)).toBeUndefined();
    expect(hasSavedSession(storage)).toBe(false);
  });

  it('migrates v1 legacy sessions cleanly without injecting fake depletion metrics', () => {
    const storage = memoryStorage();
    const session = createRoundSession(42);
    const legacy = { ...session } as Record<string, unknown>;
    delete legacy.schemaVersion;
    delete legacy.upgrades;
    delete legacy.pipeType;
    delete legacy.plant;
    delete legacy.wells;
    delete legacy.surveys;
    delete legacy.echoScans;
    delete legacy.drillSpeedLevel;
    delete legacy.ledger;
    delete legacy.resourceDepletion;
    storage.setItem(ROUND_SESSION_KEY, JSON.stringify(legacy));

    const loaded = loadSession(storage);
    expect(loaded?.schemaVersion).toBe(GAME_SESSION_SCHEMA_VERSION);
    expect(loaded?.upgrades).toEqual({ drill: 0, pipes: 0, exchanger: 0 });
    expect(loaded?.pipeType).toBe('basic');
    expect(loaded?.wells).toEqual([]);
    expect(loaded?.surveys).toEqual([]);
    expect(loaded?.echoScans).toEqual([]);
    expect(loaded?.drillSpeedLevel).toBe(1);
    expect(loaded?.ledger).toEqual([]);
    expect(loaded?.plant.roundDurationSeconds).toBe(240);
    expect(loaded?.resourceDepletion.thermalDepletionPercent).toBe(0);

    // Legacy alias compatibility
    saveRoundSession(session, storage);
    expect(loadRoundSession(storage)?.seed).toBe(42);
    clearRoundSession(storage);
    expect(loadRoundSession(storage)).toBeUndefined();
  });
});
