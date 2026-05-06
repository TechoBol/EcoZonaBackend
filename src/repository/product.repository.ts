import prisma from "../config/db";

type CreateProductDTO = {
  name: string;
  description?: string;
  barcode: string;
  imageUrl?: string;
  price: number;
  finalPrice: number;
  lineId: number;
  brandName: string;
};

// 🔥 CREAR PRODUCTO
export const createProductRepo = async (data: CreateProductDTO) => {
  return prisma.product.create({
    data,
  });
};

// 🔥 GET ALL
export const getProductsRepo = async (
  locationId: number,
  isManagement: boolean
) => {
  if (isManagement) {
    const products = await prisma.product.findMany({
      where: { isVisible: true },
      include: {
        line: true,
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
        stockTotal: p.inventories.reduce(
          (acc, inv) => acc + inv.quantity,
          0
        ),
        inventories: p.inventories.map((inv) => ({
          locationId: inv.locationId,
          locationName: inv.location.name,
          quantity: inv.quantity,
        })),
      }))
      .sort((a, b) => b.stockTotal - a.stockTotal);
  }

  const products = await prisma.product.findMany({
    where: { isVisible: true },
    include: {
      line: true,
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


export const getProductByIdRepo = async (id: number) => {
  return prisma.product.findUnique({
    where: { id },
    include: {
      line: true,
      inventories: true,
    },
  });
};

// 🔥 UPDATE
export const updateProductRepo = async (id: number, data: any) => {
  const { stock, locationId, ...productData } = data;

  await prisma.product.update({
    where: { id },
    data: {
      name: productData.name,
      description: productData.description,
      barcode: productData.barcode,
      price: productData.price,
      finalPrice: productData.finalPrice,
      imageUrl: productData.imageUrl,
      lineId: productData.lineId,
      brandName: productData.brandName,
    },
  });

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

  return prisma.product.findUnique({
    where: { id },
    include: {
      line: true,
      inventories: {
        where: { locationId },
        include: {
          location: true,
        },
      },
    },
  });
};

// 🔥 DELETE
export const deleteProductRepo = async (id: number) => {
  return prisma.product.update({
    where: { id },
    data: { isVisible: false },
  });
};