import prisma from "../config/db";

// 🔥 CREAR SALE
export const createSaleRepo = async (tx: any, data: any) => {
  return await tx.sale.create({ data });
};

// 🔥 ACTUALIZAR TOTAL
export const updateSaleTotalRepo = async (
  tx: any,
  saleId: number,
  data: any,
) => {
  return await tx.sale.update({
    where: { id: saleId },

    data: {
      subtotal: data.subtotal,

      discount: data.discount,

      total: data.total,
    },
  });
};

// 🔥 INCREMENTAR CONTADOR Y OBTENER LOCATION
export const incrementLocationCounterRepo = async (
  tx: any,
  locationId: number,
) => {
  return await tx.location.update({
    where: { id: locationId },
    data: {
      saleCounter: { increment: 1 },
    },
  });
};

// 🔥 DETALLE
export const createSaleDetailRepo = async (tx: any, data: any) => {
  return await tx.saleDetail.create({ data });
};

// 🔥 INVENTARIO
export const getInventoryRepo = async (
  tx: any,
  productId: number,
  locationId: number,
) => {
  return await tx.inventory.findUnique({
    where: {
      productId_locationId: {
        productId,
        locationId,
      },
    },
  });
};

export const updateInventoryRepo = async (
  tx: any,
  productId: number,
  locationId: number,
  qty: number,
) => {
  return await tx.inventory.update({
    where: {
      productId_locationId: {
        productId,
        locationId,
      },
    },
    data: {
      quantity: {
        decrement: qty,
      },
    },
  });
};

// 🔥 PRODUCT
export const getProductRepo = async (tx: any, productId: number) => {
  return await tx.product.findUnique({
    where: { id: productId },
  });
};

export const getSalesRepo = async (
  locationId: number,
  isManagement: boolean,
) => {
  return prisma.sale.findMany({
    where: isManagement
      ? {}
      : {
          locationId: locationId,
        },

        select: {
          id: true,
          code: true,
          total: true,
          date: true,
          pdfUrl: true,
          typeSale: true,
        
          status: true,
          cancelReason: true,
          cancelledAt: true,
        
          location: {
            select: {
              name: true,
            },
          },
        
          employee: {
            select: {
              name: true,
              lastName: true,
            },
          },
        
          details: {
            select: {
              id: true,
              quantity: true,
              price: true,
        
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                },
              },
            },
          },
        },

    orderBy: {
      date: "desc",
    },
  });
};

export const cancelSaleRepo = async (
  saleId: number,
  reason: string,
  userId: number,
) => {
  return await prisma.$transaction(async (tx) => {
    console.log("=====================================");
    console.log("🔥 INICIANDO CANCELACIÓN");
    console.log("saleId:", saleId);
    console.log("=====================================");

    // =====================================================
    // 🔥 OBTENER VENTA
    // =====================================================
    const sale = await tx.sale.findUnique({
      where: {
        id: saleId,
      },

      include: {
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    console.log("🧾 VENTA:");
    console.log(JSON.stringify(sale, null, 2));

    if (!sale) {
      throw new Error("Venta no encontrada");
    }

    if (sale.status === "CANCELLED") {
      throw new Error("La venta ya fue cancelada");
    }

    console.log("=====================================");
    console.log("📦 DETALLES DE VENTA");
    console.log("=====================================");

    for (const detail of sale.details) {
      console.log("------------ PRODUCTO ------------");

      console.log("productId:", detail.productId);

      console.log("producto:", detail.product?.name);

      console.log("cantidad vendida:", detail.quantity);

      console.log("locationId venta:", sale.locationId);

      // =====================================================
      // 🔥 INVENTARIO ACTUAL
      // =====================================================
      const inventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: {
            productId: detail.productId,
            locationId: sale.locationId,
          },
        },
      });

      console.log("📦 INVENTARIO ENCONTRADO:");
      console.log(JSON.stringify(inventory, null, 2));

      if (!inventory) {
        console.log("❌ INVENTARIO NO EXISTE");

        throw new Error(
          `No existe inventario para producto ${detail.productId}`,
        );
      }

      console.log("stock actual:", inventory.quantity);

      console.log("se agregará:", detail.quantity);

      console.log(
        "nuevo stock esperado:",
        inventory.quantity + detail.quantity,
      );

      // =====================================================
      // 🔥 UPDATE INVENTARIO
      // =====================================================
      const updatedInventory = await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: detail.productId,
            locationId: sale.locationId,
          },
        },

        data: {
          quantity: {
            increment: detail.quantity,
          },
        },
      });

      console.log("✅ INVENTARIO ACTUALIZADO:");

      console.log(JSON.stringify(updatedInventory, null, 2));

      console.log("stock final:", updatedInventory.quantity);

      // =====================================================
      // 🔥 MOVIMIENTO
      // =====================================================
      const movement = await tx.stockMovement.create({
        data: {
          productId: detail.productId,

          toLocationId: sale.locationId,

          quantity: detail.quantity,

          type: "IN",

          unitCost: inventory.averageCost,

          reference: `CANCELACIÓN VENTA ${sale.code}`,
        },
      });

      console.log("📒 MOVIMIENTO CREADO:");
      console.log(JSON.stringify(movement, null, 2));
    }

    console.log("=====================================");
    console.log("🔥 ACTUALIZANDO VENTA");
    console.log("=====================================");

    const updatedSale = await tx.sale.update({
      where: {
        id: saleId,
      },

      data: {
        status: "CANCELLED",

        cancelReason: reason,

        cancelledAt: new Date(),

        cancelledById: userId,
      },
    });

    console.log("✅ VENTA CANCELADA:");
    console.log(JSON.stringify(updatedSale, null, 2));

    console.log("=====================================");
    console.log("🔥 FIN CANCELACIÓN");
    console.log("=====================================");

    return updatedSale;
  });
};