import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { UndergroundMap } from '../src/components/UndergroundMap';

describe('Turmoil-style drilling view', () => {
  test('shows one player tunnel and a target marker instead of a second suggested tunnel', () => {
    const markup = renderToStaticMarkup(
      <UndergroundMap
        reservoirs={[]}
        wells={[]}
        pipes={[]}
        suggestedTarget={{ x: 65, y: 70 }}
        drillingPath={{
          points: [{ x: 50, y: 18 }, { x: 55, y: 48 }],
          estimatedCost: 100,
          onConfirm: () => undefined,
          onCancel: () => undefined,
        }}
      />,
    );

    expect(markup.match(/class="tf-drill-path"/g)).toHaveLength(1);
    expect(markup).toContain('class="tf-drill-target"');
    expect(markup).not.toContain('tf-suggested-path');
    expect(markup).not.toContain('tf-path-svg');
    expect(markup).toContain('Your single well');
  });

  test('makes operation objects selectable when the loop is running', () => {
    const markup = renderToStaticMarkup(
      <UndergroundMap
        reservoirs={[{ id: 'r-1', x: 60, y: 70, rx: 10, ry: 7, temperature: 190, label: 'Active reservoir', status: 'active' }]}
        wells={[{ id: 'w-1', label: 'W-01', x: 50, y: 18, depth: '180 m', output: '10 TH', status: 'producing' }]}
        pipes={[]}
        onSelectObject={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Active reservoir, select reservoir"');
    expect(markup).toContain('class="tf-reservoir-hit"');
    expect(markup).toContain('aria-label="W-01, select well"');
    expect(markup).toContain('Tap the outlined field or W-01');
  });

  test('renders explicit drilling targets for a direct start-to-target route', () => {
    const markup = renderToStaticMarkup(
      <UndergroundMap
        reservoirs={[]}
        wells={[{ id: 'start', label: 'START PIPE', x: 50, y: 18, depth: '0 m', output: '—', status: 'drilling' }]}
        pipes={[]}
        drillTargets={[{ id: 'target-1', x: 65, y: 70, rx: 10, ry: 7, temperature: 190, label: 'Thermal pocket', status: 'suspected' }]}
        drillingPath={{ points: [{ x: 50, y: 18 }], onConfirm: () => undefined, onCancel: () => undefined }}
        onSelectDrillTarget={() => undefined}
      />,
    );

    expect(markup).toContain('START PIPE');
    expect(markup).toContain('Thermal pocket, select drilling target');
    expect(markup).toContain('Choose a thermal pocket');
  });
});
