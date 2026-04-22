import app from './config/server'
import { config } from 'dotenv'

import http from 'http'
import { Server as SocketServer } from 'socket.io'

config()

const port = process.env.PORT

const server = http.createServer(app)
const io = new SocketServer(server, {
  cors: {
    origin: `*`
  }
})

io.on('connection', socket => {
  console.log('a user connected ' + socket.id)
})

const host = '0.0.0.0'

server.listen({ port, host }, () => {
  console.log(`Server running on port ${port}`)
})