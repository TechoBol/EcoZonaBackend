import prisma from "../config/db";

export const getProductDetailRepo = async (productId: number, locationId: number) => {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      isVisible: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      finalPrice: true,
      brandName: true,
      line: {
        select: {
          name: true,
        },
      },
      inventories: {
        where: { locationId },
        select: { quantity: true },
        take: 1,
      },
    },
  });

  if (!product) return null;

  const { inventories, ...rest } = product;

  return {
    ...rest,
    stock: inventories.at(0)?.quantity ?? 0,
  };
};