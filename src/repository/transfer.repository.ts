import prisma from "../config/db";

export const createTransferRepo = async (data: {
  requestedById: number;
  toLocationId: number;
  items: { productId: number; quantity: number }[];
}) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Obtener la location
    const location = await tx.location.findUnique({
      where: { id: data.toLocationId },
      select: { id: true, name: true, abbreviation: true }, // usa el campo que tengas
    });

    if (!location) {
      throw new Error("Location no encontrada");
    }

    // 2. Contar transferencias de esa location
    const count = await tx.transfer.count({
      where: {
        toLocationId: data.toLocationId,
      },
    });

    // 3. Generar código
    const transferCode = `TR-${location.abbreviation}-${count + 1}`;

    // 4. Crear transferencia
    return await tx.transfer.create({
      data: {
        transferCode,
        requestedById: data.requestedById,
        toLocationId: data.toLocationId,
        status: "PENDING",
        items: {
          create: data.items,
        },
      },
      include: {
        toLocation: true,
        items: { include: { product: true } },
      },
    });
  });
};

export const getTransfersByLocationRepo = async () => {
  return prisma.transfer.findMany({
    include: {
      // 📍 LOCATIONS
      fromLocation: true,
      toLocation: true,

      // 👤 QUIÉN SOLICITA
      requestedBy: {
        select: {
          id: true,
          name: true,
          lastName: true,
          email: true,
          role: {
            select: {
              name: true
            },
          },
        },
      },

      // 👤 QUIÉN APRUEBA
      approvedBy: {
        select: {
          id: true,
          name: true,
          lastName: true,
          email: true,
          role: {
            select: {
              name: true,
            },
          },
        },
      },

      // 📦 ITEMS
      items: {
        include: {
          product: {
            include: {
              line: true, // 👈 si quieres la línea también
            },
          },
        },
      },
    },

    orderBy: { createdAt: "desc" },
  });
};

export const approveTransferRepo = async (
  transferId: number,
  approvedById: number,
  fromLocationId: number,
) => {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: true,
        requestedBy: true,
      },
    });

    if (!transfer) throw new Error("Transfer no existe");

    if (transfer.status !== "PENDING") {
      throw new Error("Transfer ya procesada");
    }

    ////////////////////////////////////////
    // 🔥 DESTINO AUTOMÁTICO
    ////////////////////////////////////////
    const toLocationId = transfer.requestedBy.locationId;

    if (!toLocationId) {
      throw new Error("El usuario no tiene sucursal asignada");
    }

    ////////////////////////////////////////
    // 🔥 VALIDAR STOCK
    ////////////////////////////////////////
    for (const item of transfer.items) {
      const inv = await tx.inventory.findUnique({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: fromLocationId,
          },
        },
      });

      if (!inv || inv.quantity < item.quantity) {
        throw new Error("Stock insuficiente");
      }
    }

    ////////////////////////////////////////
    // 🔥 MOVER STOCK
    ////////////////////////////////////////
    for (const item of transfer.items) {
      // RESTAR
      await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: fromLocationId,
          },
        },
        data: {
          quantity: { decrement: item.quantity },
        },
      });

      // SUMAR
      await tx.inventory.upsert({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: toLocationId,
          },
        },
        update: {
          quantity: { increment: item.quantity },
        },
        create: {
          productId: item.productId,
          locationId: toLocationId,
          quantity: item.quantity,
        },
      });

      // MOVIMIENTO
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          fromLocationId,
          toLocationId,
          quantity: item.quantity,
          type: "TRANSFER",
        },
      });
    }

    ////////////////////////////////////////
    // 🔥 ACTUALIZAR TRANSFER
    ////////////////////////////////////////
    return tx.transfer.update({
      where: { id: transferId },
      data: {
        status: "APPROVED",
        approvedById,
        approvedAt: new Date(),
        executedAt: new Date(),
        fromLocationId,
        toLocationId, // 🔥 automático
      },
    });
  });
};

export const rejectTransferRepo = async (
  transferId: number,
  approvedById: number,
) => {
  return prisma.transfer.update({
    where: { id: transferId },
    data: {
      status: "REJECTED",
      approvedById,
      approvedAt: new Date(),
    },
  });
};
