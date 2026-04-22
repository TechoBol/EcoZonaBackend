import { Router } from 'express'
import { createProduct } from '../controllers/product.controller'

const router = Router()

router.post('/create-product', createProduct)

export default router