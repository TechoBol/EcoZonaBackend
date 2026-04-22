import { Request, Response } from 'express'
import prisma from '../config/db'
import { createProductRepo } from '../repository/product.repository'

export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      barcode,
      imageUrl,
      price,
      finalPrice,
      stock,
      locationId
    } = req.body

    const product = await createProductRepo({
      name,
      description,
      barcode,
      imageUrl,
      price,
      finalPrice
    })

    await prisma.inventory.create({
      data: {
        productId: product.id,
        locationId,
        quantity: stock || 0
      }
    })

    return res.json(product)

  } catch (err) {
    return res.status(500).json({
      message: 'error creating product'
    })
  }
}