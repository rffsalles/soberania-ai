import { describe, it, expect } from 'vitest';
import { CurrencyMath } from '../currency-math';

describe('CurrencyMath', () => {
  it('should perform addition with precision', () => {
    const result = CurrencyMath.add(0.1, 0.2);
    expect(result.toString()).toBe('0.3');
  });

  it('should format BRL currency properly', () => {
    const formatted = CurrencyMath.formatBRL(1250.5);
    // Deve conter R$ e 1.250,50
    expect(formatted).toContain('1.250,50');
  });

  it('should calculate TCO projection correctly for 3000 students', () => {
    const tco = CurrencyMath.calculateTcoProjection(3000);
    expect(tco.studentCount).toBe(3000);
    expect(tco.applianceUnits).toBe(2);
    expect(tco.cloudAnnualCost).toBeGreaterThan(0);
    expect(tco.soberaniaAnnualCost).toBe(72000); // 42k base + 30k add node
    expect(tco.annualSavings).toBeGreaterThan(0);
    expect(tco.savingsPercent).toBeGreaterThan(0);
  });

  it('should calculate TCO for small institutions with 1 appliance', () => {
    const tco = CurrencyMath.calculateTcoProjection(500);
    expect(tco.applianceUnits).toBe(1);
    expect(tco.soberaniaAnnualCost).toBe(42000);
  });
});
