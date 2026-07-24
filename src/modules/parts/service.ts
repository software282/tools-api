import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// A Part with its manufacturer + category joined, plus (optionally) the
// viewing team's inventory quantity.
export type PartWithRelations = Prisma.PartGetPayload<{
  include: {
    manufacturer: { select: { id: true; name: true; slug: true } };
    category: { select: { id: true; name: true; slug: true } };
    inventoryItems: true;
  };
}>;

const relationInclude = (viewerTeamId: string | null) =>
  ({
    manufacturer: { select: { id: true, name: true, slug: true } },
    category: { select: { id: true, name: true, slug: true } },
    // Only pull the viewer team's own inventory row (if any) for quantity.
    // With no team, the sentinel id matches nothing -> empty array.
    inventoryItems: { where: { teamId: viewerTeamId ?? '__none__' }, take: 1 },
  }) satisfies Prisma.PartInclude;

/**
 * Visibility rule shared by search and single-part reads: a viewer can see
 * approved global parts, plus their own team's custom parts.
 */
export function visibilityFilter(viewerTeamId: string | null): Prisma.PartWhereInput {
  const or: Prisma.PartWhereInput[] = [{ scope: 'GLOBAL', status: 'APPROVED' }];
  if (viewerTeamId) {
    or.push({ scope: 'TEAM', createdByTeamId: viewerTeamId });
  }
  return { OR: or };
}

export interface SearchParams {
  q?: string;
  category?: string;
  manufacturer?: string;
  scope?: 'GLOBAL' | 'TEAM';
  ownedOnly?: boolean;
  page: number;
  pageSize: number;
}

export async function searchParts(params: SearchParams, viewerTeamId: string | null) {
  const and: Prisma.PartWhereInput[] = [visibilityFilter(viewerTeamId)];

  if (params.q) {
    and.push({
      OR: [
        { name: { contains: params.q, mode: 'insensitive' } },
        { sku: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
        { manufacturer: { name: { contains: params.q, mode: 'insensitive' } } },
      ],
    });
  }
  if (params.category) and.push({ category: { slug: params.category } });
  if (params.manufacturer) and.push({ manufacturer: { slug: params.manufacturer } });
  if (params.scope) and.push({ scope: params.scope });
  if (params.ownedOnly && viewerTeamId) {
    and.push({ inventoryItems: { some: { teamId: viewerTeamId, quantity: { gt: 0 } } } });
  }

  const where: Prisma.PartWhereInput = { AND: and };
  const skip = (params.page - 1) * params.pageSize;

  const [rows, total] = await Promise.all([
    prisma.part.findMany({
      where,
      include: relationInclude(viewerTeamId),
      orderBy: [{ manufacturer: { name: 'asc' } }, { name: 'asc' }],
      skip,
      take: params.pageSize,
    }),
    prisma.part.count({ where }),
  ]);

  return {
    items: rows.map((p) => serializePart(p, viewerTeamId)),
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function getPartById(id: string, viewerTeamId: string | null) {
  const part = await prisma.part.findFirst({
    where: { AND: [{ id }, visibilityFilter(viewerTeamId)] },
    include: relationInclude(viewerTeamId),
  });
  return part ? serializePart(part, viewerTeamId) : null;
}

export function serializePart(part: PartWithRelations, viewerTeamId: string | null) {
  const owned = viewerTeamId ? (part.inventoryItems[0]?.quantity ?? 0) : null;
  return {
    id: part.id,
    name: part.name,
    sku: part.sku,
    description: part.description,
    productUrl: part.productUrl,
    purchaseUrl: part.purchaseUrl,
    imageUrl: part.imageUrl,
    scope: part.scope,
    status: part.status,
    manufacturer: part.manufacturer,
    category: part.category,
    createdByTeamId: part.createdByTeamId,
    createdAt: part.createdAt.toISOString(),
    ownedQuantity: owned,
  };
}
