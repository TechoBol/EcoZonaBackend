import prisma from '../config/db'
import { Employee } from '@prisma/client'

export const getAllEmloyees = async () => {
  return prisma.employee.findMany({
    where: {
      isVisible: true
    },
    select: {
      id: true,
      name: true,
      lastName: true,
      email: true,
      regionalOffice: {
        select: {
          id: true,
          name: true
        }
      },
      role: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      lastName: 'asc'
    }
  })
}

export const registerEmployeeRepository = async (newEmployeeData: Employee) => {
  const result = await prisma.employee.create({
    data: {
      name: newEmployeeData.name,
      lastName: newEmployeeData.lastName,
      email: newEmployeeData.email,
      password: newEmployeeData.password,
      regionalOfficeId: newEmployeeData.regionalOfficeId,
      roleId: newEmployeeData.roleId
    },
    select: {
      id: true,
      name: true,
      lastName: true,
      email: true,
      regionalOffice: {
        select: {
          id: true,
          name: true
        }
      },
      role: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })
  return result
}

export const updateVisibilityEmployeeRepository = async (id: number) => {
  return prisma.employee.update({
    where: {
      id: id
    },
    data: {
      email: Math.random().toString(36).slice(-20),
      isVisible: false
    }
  })
}

export const getOneEmployeeToValidateToken = async (
  id: number,
  password: string
) => {
  return prisma.employee.findMany({
    where: {
      id: {
        equals: id
      },
      password: {
        equals: password
      }
    },
    select: {
      id: true,
      name: true
    }
  })
}

export const changePasswordRepository = async (
  id: number,
  newPassword: string
) => {
  return prisma.employee.update({
    where: {
      id: id
    },
    data: {
      password: newPassword
    }
  })
}
