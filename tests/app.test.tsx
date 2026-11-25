import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import App from '../src/App';

describe('Thermal Frontier game shell', () => {
  test('starts on Planet Introduction (Zephyr-7) with 6-stage navigation', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Zephyr-7');
    expect(markup).toContain('Start Round ▶');
    expect(markup).toContain('Planet Select');
    expect(markup).toContain('Choose land');
    expect(markup).toContain('Surface Survey');
    expect(markup).toContain('Drilling');
    expect(markup).toContain('Production Setup');
    expect(markup).toContain('Round Report');
  });

  test('renders Land Auction with 3 rivals and zero hidden reservoir leaks', () => {
    const markup = renderToStaticMarkup(<App initialPhase="auction" />);

    expect(markup).toContain('Land Auction');
    expect(markup).toContain('Choose land before you build anything.');
    expect(markup).toContain('Caelum');
    expect(markup).toContain('Vanguard');
    expect(markup).toContain('Helios');
    expect(markup).not.toContain('Market &amp; storage');
    expect(markup).not.toContain('MAGMA POOL');
  });
});
