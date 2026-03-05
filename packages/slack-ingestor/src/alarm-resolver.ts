import { prisma } from "@go-watchtower/database";

/**
 * Risolve l'ID di un Alarm dato productId e nome dell'allarme.
 *
 * Strategia:
 * 1. Exact match (sfrutta l'indice unico su (productId, name))
 * 2. Case-insensitive fallback
 * 3. Auto-create + retry su race condition (P2002)
 */
export async function resolveAlarmId(
  productId: string,
  alarmName: string,
): Promise<string> {
  // 1. Exact match
  const exact = await prisma.alarm.findUnique({
    where: { productId_name: { productId, name: alarmName } },
    select: { id: true },
  });
  if (exact) return exact.id;

  // 2. Case-insensitive fallback
  const ci = await prisma.alarm.findFirst({
    where: { productId, name: { equals: alarmName, mode: "insensitive" } },
    select: { id: true },
  });
  if (ci) return ci.id;

  // 3. Auto-create
  try {
    const created = await prisma.alarm.create({
      data: { name: alarmName, productId },
      select: { id: true },
    });
    console.log(`[alarm-resolver] Auto-created alarm "${alarmName}" in product ${productId}`);
    return created.id;
  } catch (err: unknown) {
    // Race condition: un'altra invocazione concorrente ha già creato l'allarme
    if (isPrismaUniqueError(err)) {
      const retry = await prisma.alarm.findUnique({
        where: { productId_name: { productId, name: alarmName } },
        select: { id: true },
      });
      if (retry) return retry.id;
    }
    throw err;
  }
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
