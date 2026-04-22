import { Response, Request } from 'express'
import { config } from 'dotenv'
import prisma from '../config/db'
import jwt, {JwtPayload} from 'jsonwebtoken'
import bcrypt from 'bcrypt'

import { getOneEmployeeToValidateToken } from '../repository/employee.repository'
config()

export const signIn = async (req: Request, res: Response) => {
  try {
    const { password, username } = req.body

    const employeeFound = await prisma.employee.findUnique({
      where: {
        email: username
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        email: true,
        password: true,
        role: {
          select: {
            name: true
          }
        },
        regionalOffice: { 
          select: { 
            name: true
          }
        }
      }
    })

    if (!employeeFound) {
      return res.status(400).json({ message: 'user not found' })
    }

    const passwordIsValid = await bcrypt.compare(password, employeeFound?.password as string)

    if (!passwordIsValid) {
      return res.status(400).json({ message: 'password incorrect' })
    }

    const secret = process.env.JWTSECRET
    const token = jwt.sign({ email: employeeFound?.email , id: employeeFound.id }, secret as string)

    return res.status(200).json({
      name: employeeFound?.name,
      lastName: employeeFound?.lastName,
      email: employeeFound?.email,
      role: employeeFound.role?.name,
      regionalOffice: employeeFound.regionalOffice?.name,
      token
    })
  } catch (err) {
    if (err instanceof Error) {
      return res.status(500).json({ message: err.message })
    }
    return res.status(500).json({ message: 'internal server error' })
  }
}

export const validateToken = async (req: Request, res: Response) => {
  try {
    const response = jwt.verify(req.body.token, process.env.JWTSECRET as string)

   const password = (response as JwtPayload).password
    const id = (response as JwtPayload).id

    const employeeFound = await getOneEmployeeToValidateToken(id, password)

    if (employeeFound.length === 0) {
      return res.status(400).json({ message: 'token is invalid' })
    }

    return res.status(200).json({ message: 'token is valid' })
  } catch {
    return res.status(500).json({ message: 'internal server error' })
  }
}
