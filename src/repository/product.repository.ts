import prisma from "../config/db";

type CreateProductDTO = {
  name: string;
  description?: string;
  barcode: string;
  imageUrl?: string;
  price: number;
  finalPrice: number;
};

// 🔥 CREAR PRODUCTO
export const createProductRepo = async (data: CreateProductDTO) => {
  return prisma.product.create({
    data,
  });
};

// 🔥 OBTENER TODOS
// ✅ así debe estar la firma
export const getProductsRepo = async (
  locationId: number,
  isManagement: boolean,
) => {
  // 🔥 GERENCIA: trae inventarios de todas las sucursales con su info
  if (isManagement) {
    const products = await prisma.product.findMany({
      where: { isVisible: true },
      include: {
        inventories: {
          include: {
            location: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return products
      .map((p) => ({
        ...p,
        inventories: undefined,
        stockTotal: p.inventories.reduce((acc, inv) => acc + inv.quantity, 0),
        stockBySucursal: p.inventories.map((inv) => ({
          locationId: inv.locationId,
          locationName: inv.location.name,
          quantity: inv.quantity,
        })),
      }))
      .sort((a, b) => b.stockTotal - a.stockTotal);
  }

  // 🔥 EMPLEADO NORMAL: comportamiento original sin tocar nada
  const products = await prisma.product.findMany({
    where: { isVisible: true },
    include: {
      inventories: {
        where: { locationId },
      },
    },
  });

  return products.sort((a, b) => {
    const stockA = a.inventories[0]?.quantity || 0;
    const stockB = b.inventories[0]?.quantity || 0;
    return stockB - stockA;
  });
};

// 🔥 OBTENER UNO
export const getProductByIdRepo = async (id: number) => {
  return prisma.product.findUnique({
    where: { id },
    include: {
      inventories: true,
    },
  });
};

// 🔥 ACTUALIZAR
export const updateProductRepo = async (id: number, data: any) => {
  const { stock, locationId, ...productData } = data;

  // 1. actualizar producto
  await prisma.product.update({
    where: { id },
    data: {
      name: productData.name,
      description: productData.description,
      barcode: productData.barcode,
      price: productData.price,
      finalPrice: productData.finalPrice,
      imageUrl: productData.imageUrl,
    },
  });

  // 2. actualizar inventario
  if (stock !== undefined && locationId) {
    await prisma.inventory.upsert({
      where: {
        productId_locationId: {
          productId: id,
          locationId,
        },
      },
      update: {
        quantity: stock,
      },
      create: {
        productId: id,
        locationId,
        quantity: stock,
      },
    });
  }

  // 3. devolver producto COMPLETO con inventario
  const updatedProduct = await prisma.product.findUnique({
    where: { id },
    include: {
      inventories: {
        include: {
          location: true, // opcional pero útil
        },
      },
    },
  });

  return updatedProduct;
};

// 🔥 DELETE LÓGICO
export const deleteProductRepo = async (id: number) => {
  return prisma.product.update({
    where: { id },
    data: { isVisible: false },
  });
};
