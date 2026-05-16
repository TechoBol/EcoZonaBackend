import prisma from "../config/db";

export const createTransferRepo = async (data: {
  requestedById: number;
  toLocationId: number;
  fromLocationID?: number;
  items: { productId: number; quantity: number }[];
  glosa : string;
}) => {
  return await prisma.$transaction(async (tx) => {
    ////////////////////////////////////////
    // 🔥 LOCATION DESTINO
    ////////////////////////////////////////

    const location = await tx.location.findUnique({
      where: { id: data.toLocationId },
      select: {
        id: true,
        name: true,
        abbreviation: true,
      },
    });

    if (!location) {
      throw new Error("Location no encontrada");
    }

    ////////////////////////////////////////
    // 🔥 CONTADOR
    ////////////////////////////////////////

    const count = await tx.transfer.count({
      where: {
        toLocationId: data.toLocationId,
      },
    });

    ////////////////////////////////////////
    // 🔥 CODIGO TRANSFERENCIA
    ////////////////////////////////////////

    const transferCode = `TR-${location.abbreviation}-${count + 1}`;

    ////////////////////////////////////////
    // 🔥 CREAR TRANSFERENCIA
    ////////////////////////////////////////

    return await tx.transfer.create({
      data: {
        transferCode,

        requestedById: data.requestedById,

        toLocationId: data.toLocationId,

        fromLocationId: data.fromLocationID,

        status: "PENDING",

        items: {
          create: data.items,
        },
        glosa: data.glosa
      },

      include: {
        fromLocation: true,

        toLocation: true,

        requestedBy: true,

        items: {
          include: {
            product: {
              include: {
                line: true,
              },
            },
          },
        },
      },
    });
  });
};

export const getTransfersByLocationRepo = async () => {
  return prisma.transfer.findMany({
    include: {
      ////////////////////////////////////////
      // 🔥 LOCATIONS
      ////////////////////////////////////////

      fromLocation: true,

      toLocation: true,

      ////////////////////////////////////////
      // 🔥 SOLICITANTE
      ////////////////////////////////////////

      requestedBy: {
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

      ////////////////////////////////////////
      // 🔥 APROBADOR
      ////////////////////////////////////////

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

      ////////////////////////////////////////
      // 🔥 ITEMS
      ////////////////////////////////////////

      items: {
        include: {
          product: {
            include: {
              line: true,
            },
          },
        },
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });
};

export const approveTransferRepo = async (
  transferId: number,
  approvedById: number,
  fromLocationId: number,
) => {
  return prisma.$transaction(async (tx) => {
    ////////////////////////////////////////
    // 🔥 OBTENER TRANSFERENCIA
    ////////////////////////////////////////

    const transfer = await tx.transfer.findUnique({
      where: {
        id: transferId,
      },

      include: {
        items: true,
        requestedBy: true,
      },
    });

    if (!transfer) {
      throw new Error("Transfer no existe");
    }

    if (transfer.status !== "PENDING") {
      throw new Error("Transfer ya procesada");
    }

    ////////////////////////////////////////
    // 🔥 DESTINO
    ////////////////////////////////////////

    const toLocationId = transfer.toLocationId;

    if (!toLocationId) {
      throw new Error("Location destino inválida");
    }

    ////////////////////////////////////////
    // 🔥 VALIDAR STOCK
    ////////////////////////////////////////

    for (const item of transfer.items) {
      const inventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: fromLocationId,
          },
        },
      });

      if (!inventory || inventory.quantity < item.quantity) {
        throw new Error(
          `Stock insuficiente para producto ${item.productId}`,
        );
      }
    }

    ////////////////////////////////////////
    // 🔥 MOVER STOCK
    ////////////////////////////////////////

    for (const item of transfer.items) {
      ////////////////////////////////////////
      // 🔥 INVENTARIO ORIGEN
      ////////////////////////////////////////

      const sourceInventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: fromLocationId,
          },
        },
      });

      if (!sourceInventory) {
        throw new Error("Inventario origen no encontrado");
      }

      ////////////////////////////////////////
      // 🔥 COSTO PROMEDIO ORIGEN
      ////////////////////////////////////////

      const averageCost = sourceInventory.averageCost || 0;

      ////////////////////////////////////////
      // 🔥 RESTAR ORIGEN
      ////////////////////////////////////////

      await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: fromLocationId,
          },
        },

        data: {
          quantity: {
            decrement: item.quantity,
          },
        },
      });

      ////////////////////////////////////////
      // 🔥 INVENTARIO DESTINO
      ////////////////////////////////////////

      const targetInventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: toLocationId,
          },
        },
      });

      ////////////////////////////////////////
      // 🔥 SI EXISTE DESTINO
      ////////////////////////////////////////

      if (targetInventory) {
        const cantidadActual = targetInventory.quantity;

        const costoActual = targetInventory.averageCost;

        const totalActual = cantidadActual * costoActual;

        const totalNuevo = item.quantity * averageCost;

        const nuevaCantidad = cantidadActual + item.quantity;

        const nuevoPromedio =
          nuevaCantidad > 0
            ? (totalActual + totalNuevo) / nuevaCantidad
            : averageCost;

        await tx.inventory.update({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: toLocationId,
            },
          },

          data: {
            quantity: {
              increment: item.quantity,
            },

            averageCost: nuevoPromedio,
          },
        });
      } else {
        ////////////////////////////////////////
        // 🔥 CREAR INVENTARIO DESTINO
        ////////////////////////////////////////

        await tx.inventory.create({
          data: {
            productId: item.productId,

            locationId: toLocationId,

            quantity: item.quantity,

            averageCost: averageCost,
          },
        });
      }

      ////////////////////////////////////////
      // 🔥 MOVIMIENTO KARDEX
      ////////////////////////////////////////

      await tx.stockMovement.create({
        data: {
          productId: item.productId,

          fromLocationId,
          toLocationId,

          quantity: item.quantity,

          type: "TRANSFER",

          transferId: transfer.id,

          // 🔥 COSTO HISTORICO REAL
          unitCost: averageCost,

          reference: transfer.transferCode,
        },
      });
    }

    ////////////////////////////////////////
    // 🔥 ACTUALIZAR TRANSFERENCIA
    ////////////////////////////////////////

    return await tx.transfer.update({
      where: {
        id: transferId,
      },

      data: {
        status: "APPROVED",

        approvedById,

        approvedAt: new Date(),

        executedAt: new Date(),

        fromLocationId,
      },

      include: {
        fromLocation: true,

        toLocation: true,

        requestedBy: true,

        approvedBy: true,

        items: {
          include: {
            product: true,
          },
        },
      },
    });
  });
};

export const rejectTransferRepo = async (
  transferId: number,
  approvedById: number,
) => {
  return prisma.transfer.update({
    where: {
      id: transferId,
    },

    data: {
      status: "REJECTED",

      approvedById,

      approvedAt: new Date(),
    },
  });
};