import { Prisma } from '@prisma/client';

export const sumDecimals = (...decimals: (Prisma.Decimal | string | number | undefined | null)[]): Prisma.Decimal => {
  return decimals.reduce((acc: Prisma.Decimal, curr) => {
    if (!curr) return acc;
    return acc.plus(new Prisma.Decimal(curr));
  }, new Prisma.Decimal(0));
};

export const multiplyDecimal = (val: Prisma.Decimal | string | number, multiplier: number): Prisma.Decimal => {
  return new Prisma.Decimal(val).times(multiplier);
};

// Decimal.times(100) opera em precisão arbitrária (decimal.js), não em float --
// diferente de `Number(price) * 100`, que reintroduziria erro de arredondamento.
export const toCents = (val: Prisma.Decimal | string | number | null | undefined): number => {
  if (val === null || val === undefined) return 0;
  return new Prisma.Decimal(val).times(100).round().toNumber();
};
