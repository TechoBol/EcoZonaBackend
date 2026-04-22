import prisma from '../config/db.js'

export const createSaleRepo = async (data) => {
  return await prisma.sale.create({
    data
  })
}

export const createSaleDetailRepo = async (data) => {
  return await prisma.saleDetail.create({
    data
  })
}

export const getInventoryRepo = async (productId, locationId) => {
  return await prisma.inventory.findUnique({
    where: {
      productId_locationId: {
        productId,
        locationId
      }
    }
  })
}

export const updateInventoryRepo = async (productId, locationId, qty) => {
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