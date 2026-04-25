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
export const getProductsRepo = async (locationId: number) => {
  return prisma.product.findMany({
    where: { isVisible: true },
    include: {
      inventories: {
        where: {
          locationId: locationId,
        },
      },
    },
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
