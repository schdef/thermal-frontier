import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createRoundSession } from '../src/game/session';
import { saveSession } from '../src/game/storage';

describe('playable round controls', () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('launches from Planet Introduction into Land Auction on Start Round', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<App />));
    const startBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start Round'),
    ) as HTMLButtonElement;
    expect(startBtn).toBeTruthy();

    await act(async () => startBtn.click());
    expect(container.textContent).toContain('Land Auction');
    expect(container.textContent).toContain('Caelum');
    expect(container.textContent).toContain('Vanguard');
    expect(container.textContent).toContain('Helios');

    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps survey controls locked until the player wins a parcel', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<App initialPhase="auction" />));

    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Scan Area'),
      ),
    ).toBe(false);
    expect(container.textContent).toContain('Choose land before you build anything.');

    await act(async () => root.unmount());
    container.remove();
  });

  it('withdraws while the auction is open', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<App initialPhase="auction" />));
    const withdraw = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Withdraw',
    ) as HTMLButtonElement;
    expect(withdraw).toBeTruthy();

    await act(async () => withdraw.click());
    expect(container.textContent).toContain('You withdrew');

    await act(async () => root.unmount());
    container.remove();
  });

  it('transitions to Surface Survey once the player wins a parcel auction', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<App initialPhase="auction" />));

    // Place strong bid above rival max valuations ($760 beats all 3 rivals), then let 30s countdown resolve
    for (let step = 0; step < 7; step += 1) {
      const incBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('+$100'),
      ) as HTMLButtonElement | undefined;
      if (!incBtn || incBtn.disabled) break;
      await act(async () => incBtn.click());
    }

    const placeBid = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.startsWith('Place Bid'),
    ) as HTMLButtonElement;
    await act(async () => placeBid.click());

    await act(async () => {
      vi.advanceTimersByTime(35_000);
    });

    expect(container.textContent).toContain('Surface Survey');
    expect(
      Array.from(container.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Scan Area'),
      ),
    ).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps surveys locked and offers Retry Auction when rivals win all parcels', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<App initialPhase="auction" />));
    await act(async () => {
      vi.advanceTimersByTime(32_000);
    });

    expect(container.textContent).toContain('Retry Auction');
    expect(
      Array.from(container.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Scan Area'),
      ),
    ).toBe(false);

    await act(async () => root.unmount());
    container.remove();
  });

  it('deploys Scan Car echo scan and upgrades drill speed in Drilling phase', async () => {
    const base = createRoundSession(42, 1000, { initialPhase: 'drill' });
    const ownedId = base.parcels[0].id;
    saveSession({
      ...base,
      ownedParcelId: ownedId,
      ownedParcelIds: [ownedId],
      selectedParcelId: ownedId,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<App />));

    const scanCarBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Scan Car ($35)'),
    ) as HTMLButtonElement;
    expect(scanCarBtn).toBeTruthy();

    await act(async () => scanCarBtn.click());
    expect(container.textContent).toContain('$965');
    expect(container.querySelector('.tf-surface-scan-car')).toBeTruthy();

    const speedBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Speed Mk II ($80)'),
    ) as HTMLButtonElement;
    expect(speedBtn).toBeTruthy();

    await act(async () => speedBtn.click());
    expect(container.textContent).toContain('$885');
    expect(container.textContent).toContain('Speed Mk III ($160)');

    await act(async () => root.unmount());
    container.remove();
  });
});
