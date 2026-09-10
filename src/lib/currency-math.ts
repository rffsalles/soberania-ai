import Decimal from 'decimal.js';

export class CurrencyMath {
  /**
   * Converte valor para Decimal seguro
   */
  public static toDecimal(value: number | string | Decimal): Decimal {
    return new Decimal(value);
  }

  /**
   * Adiciona dois ou mais valores
   */
  public static add(a: number | string | Decimal, b: number | string | Decimal): Decimal {
    return new Decimal(a).plus(new Decimal(b));
  }

  /**
   * Subtrai b de a
   */
  public static subtract(a: number | string | Decimal, b: number | string | Decimal): Decimal {
    return new Decimal(a).minus(new Decimal(b));
  }

  /**
   * Multiplica a por b
   */
  public static multiply(a: number | string | Decimal, b: number | string | Decimal): Decimal {
    return new Decimal(a).times(new Decimal(b));
  }

  /**
   * Divide a por b
   */
  public static divide(a: number | string | Decimal, b: number | string | Decimal): Decimal {
    const divisor = new Decimal(b);
    if (divisor.isZero()) {
      return new Decimal(0);
    }
    return new Decimal(a).dividedBy(divisor);
  }

  /**
   * Formata valor numérico para Moeda BRL (R$)
   */
  public static formatBRL(value: number | string | Decimal): string {
    const dec = new Decimal(value);
    const num = dec.toNumber();
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  /**
   * Formata número compacto (ex: 12.5k, 1.2M)
   */
  public static formatCompactNumber(value: number | string | Decimal): string {
    const dec = new Decimal(value);
    const num = dec.toNumber();
    return new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      compactDisplay: 'short',
    }).format(num);
  }

  /**
   * Calcula o custo anual estimado em nuvem (OpenAI / Claude) vs Appliance Soberania AI
   *
   * Premissas realistas de mercado:
   * - Média de 150.000 tokens/aluno/mês (duas aulas semanais + dúvidas + provas)
   * - Custo médio Blended Nuvem: US$ 3.00 por milhão de tokens (~R$ 17.50 / M tokens)
   * - Custo mensal por aluno em nuvem: ~R$ 2.62 / aluno / mês -> ~R$ 31.50 / aluno / ano
   * - Appliance Soberania AI: Comodato fixo institucional (custo marginal decrescente)
   */
  public static calculateTcoProjection(studentCount: number) {
    const students = new Decimal(studentCount);
    
    // Tokens mensais por aluno = 150k
    const tokensPerStudentMonth = new Decimal(150_000);
    // Custo por milhão de tokens em BRL (incluindo IOF e margem de flutuação cambial)
    const costPerMillionTokensBrl = new Decimal(17.50);
    
    // Custo Anual Nuvem por Aluno = (150.000 * 12 / 1.000.000) * 17.50 = R$ 31,50/ano
    const annualCostPerStudentCloud = tokensPerStudentMonth
      .times(12)
      .dividedBy(1_000_000)
      .times(costPerMillionTokensBrl);

    // Custo Total Nuvem Anual
    const totalAnnualCloudCost = students.times(annualCostPerStudentCloud);

    // Appliance Soberania AI:
    // Até 1.500 alunos = 1 Appliance (R$ 3.500/mês comodato = R$ 42.000/ano)
    // Cada 1.500 alunos adicionais = +1 nó/appliance (R$ 2.500/mês nó adicional)
    const applianceUnits = Decimal.max(1, students.dividedBy(1500).ceil());
    const baseCostYear = new Decimal(42_000);
    const additionalNodeCostYear = new Decimal(30_000);
    
    const totalAnnualSoberaniaCost = baseCostYear.plus(
      applianceUnits.minus(1).times(additionalNodeCostYear)
    );

    // Economia Anual
    const annualSavings = totalAnnualCloudCost.minus(totalAnnualSoberaniaCost);
    const savingsPercent = totalAnnualCloudCost.isPositive() && !totalAnnualCloudCost.isZero()
      ? annualSavings.dividedBy(totalAnnualCloudCost).times(100).toNumber()
      : 0;

    return {
      studentCount,
      applianceUnits: applianceUnits.toNumber(),
      cloudAnnualCost: totalAnnualCloudCost.toNumber(),
      cloudAnnualCostFormatted: this.formatBRL(totalAnnualCloudCost),
      soberaniaAnnualCost: totalAnnualSoberaniaCost.toNumber(),
      soberaniaAnnualCostFormatted: this.formatBRL(totalAnnualSoberaniaCost),
      annualSavings: Math.max(0, annualSavings.toNumber()),
      annualSavingsFormatted: this.formatBRL(Math.max(0, annualSavings.toNumber())),
      savingsPercent: Math.max(0, Math.round(savingsPercent)),
    };
  }
}
