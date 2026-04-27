import prisma from "../config/db";

// 🔥 CREAR SALE
export const createSaleRepo = async (tx: any, data: any) => {
  return await tx.sale.create({ data });
};

// 🔥 ACTUALIZAR TOTAL
export const updateSaleTotalRepo = async (
  tx: any,
  saleId: number,
  total: number,
) => {
  return await tx.sale.update({
    where: { id: saleId },
    data: { total },
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
          locationId: locationId, // 🔥 solo su sucursal
        },

    select: {
      id: true,
      code: true,
      total: true,
      date: true,
      pdfUrl: true,
      typeSale: true,
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
    },

    orderBy: {
      date: "desc",
    },
  });
};
