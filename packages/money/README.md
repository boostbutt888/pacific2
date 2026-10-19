# @pacific2/money

Pure TypeScript money and tax engine shared by the POS (also offline), SOK, COP and the API (ADR-009).

- Amounts are integer minor units (cents); rates are basis points (900 = 9%). No floats.
- GST is rounded half-up once per **store order**; the checkout total is the sum of store orders (D-096).
- Order-level amounts are allocated to store orders, then to lines, by largest remainder; ties go to the store, then the line, listed first in the cart display order (NA-28, D-105).
- Container fees are never discountable (D-135 f). Cash rounding is a payment adjustment outside the GST base (D-111).

Worked examples W1-W25 from ADR-009 §6 live in `test/worked-examples.test.ts`.
