import prisma from '../config/db.js'
import {
  createSaleRepo,
  createSaleDetailRepo,
  getInventoryRepo,
  updateInventoryRepo
} from '../repositories/sale.repository.js'

export const createSale = async (req, res) => {
  try {
    const { employeeId, locationId, products } = req.body

    let total = 0

    for (const item of products) {
      const inventory = await getInventoryRepo(
        item.productId,
        locationId
      )

      if (!inventory || inventory.quantity < item.quantity) {
        return res.status(400).json({
          message: 'insufficient stock'
        })
      }
    }

    const sale = await createSaleRepo({
      employeeId,
      locationId,
      total: 0
    })

    for (const item of products) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId }
      })

      const price = product.finalPrice

      total += price * item.quantity

      await createSaleDetailRepo({
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        price
      })

      await updateInventoryRepo(
        item.productId,
        locationId,
        item.quantity
      )
    }

    await prisma.sale.update({
      where: { id: sale.id },
      data: { total }
    })

    return res.json({
      message: 'sale completed',
      saleId: sale.id,
      total
    })

  } catch (err) {
    return res.status(500).json({ message: 'error creating sale' })
  }
}