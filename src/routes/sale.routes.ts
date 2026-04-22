import { Router } from 'express'
import { createSale } from '../controllers/sale.controller'

const router = Router()

router.post('/create-sale', createSale)

export default router