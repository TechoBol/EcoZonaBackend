import { Router } from 'express'
import { createProduct , getProducts } from '../controllers/product.controller'

const router = Router()

router.post('/create-product', createProduct)
router.get('/get-products', getProducts)
/*
router.get('/', getProducts)
router.get('/:id', getProductById)
router.put('/:id', updateProduct)
router.delete('/:id', deleteProduct)*/

export default router