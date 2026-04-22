import prisma from '../config/db'

export const createSaleRepo = async (data: { employeeId: any; locationId: any; total: number }) => {
  return await prisma.sale.create({
    data
  })
}

export const createSaleDetailRepo = async (data: { saleId: number; productId: any; quantity: any; price: number; }) => {
  return await prisma.saleDetail.create({
    data
  })
}

export const getInventoryRepo = async (productId: any, locationId: any) => {
  return await prisma.inventory.findUnique({
    where: {
      productId_locationId: {
        productId,
        locationId
      }
    }
  })
}

export const updateInventoryRepo = async (productId: any, locationId: any, qty: any) => {
  return await prisma.inventory.update({
    where: {
      productId_locationId: {
        productId,
        locationId
      }
    },
    data: {
      quantity: {
        decrement: qty
      }
    }
  })
}