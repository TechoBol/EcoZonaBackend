import { Router } from 'express'
import { createProduct } from '../controllers/product.controller'

const router = Router()

router.post('/create-product', createProduct)
/*
router.get('/', getProducts)
router.get('/:id', getProductById)
router.put('/:id', updateProduct)
router.delete('/:id', deleteProduct)*/

export default router