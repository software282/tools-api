import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { toCsv } from '../../lib/csv.js';
import { expensesResponse } from './schemas.js';
import { getTeamExpenses } from './service.js';

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['expenses'],
        summary: "Your team's spending, grouped by category then by part",
        description:
          'Built from every inventory-quantity increase that had a knowable cost: an ' +
          'exact price parsed off a confirmed receipt line (source RECEIPT), or a ' +
          "fallback to the part's own last known price for a manual inventory bump " +
          '(source ESTIMATED — that price may itself trace back to an earlier receipt, ' +
          "or to unitCost typed in by hand on POST /parts when adding a brand-new part). " +
          'A quantity increase with no knowable cost at all creates no row — never a ' +
          'fabricated one, so `allExact: false` on a part row is the honest signal that ' +
          'its total mixes in an estimate rather than only real receipt prices.',
        security: [{ bearerAuth: [] }],
        response: { 200: expensesResponse },
      },
    },
    async (req) => getTeamExpenses(req.auth!.teamId!),
  );

  r.get(
    '/export.csv',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['expenses'],
        summary: 'Download the same spending breakdown as CSV',
        security: [{ bearerAuth: [] }],
        produces: ['text/csv'],
      },
    },
    async (req, reply) => {
      const data = await getTeamExpenses(req.auth!.teamId!);
      const header = [
        'Category',
        'Part',
        'SKU',
        'Manufacturer',
        'Quantity Purchased',
        'Currently Owned',
        'Last Unit Cost',
        'Average Unit Cost',
        'Total Spent',
        'Exact (vs. estimated)',
        'Last Purchased',
      ];
      const rows = data.categories.flatMap((cat) =>
        cat.parts.map((p) => [
          cat.categoryName,
          p.name,
          p.sku ?? '',
          p.manufacturer.name,
          String(p.quantityPurchased),
          String(p.currentQuantityOwned),
          p.lastUnitCost !== null ? p.lastUnitCost.toFixed(2) : '',
          p.averageUnitCost.toFixed(2),
          p.totalSpent.toFixed(2),
          p.allExact ? 'YES' : 'NO',
          p.lastPurchasedAt ?? '',
        ]),
      );

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="expenses.csv"');
      return toCsv(header, rows);
    },
  );
};

export default routes;
