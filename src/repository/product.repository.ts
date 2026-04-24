import prisma from "../config/db";

type CreateProductDTO = {
  name: string;
  description?: string;
  barcode: string;
  imageUrl?: string;
  price: number;
  finalPrice: number;
};

type UpdateProductDTO = Partial<CreateProductDTO>;

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
export const updateProductRepo = async (id: number, data: UpdateProductDTO) => {
  return prisma.product.update({
    where: { id },
    data,
  });
};

// 🔥 DELETE LÓGICO
export const deleteProductRepo = async (id: number) => {
  return prisma.product.update({
    where: { id },
    data: { isVisible: false },
  });
};
