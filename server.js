//SECTION IMPORTS
import express from "express"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url"
//!SECTION 

//SECTION Server Creation
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

//NOTE - PORT
const PORT = process.env.PORT || 3500

//NOTE - Express Sever
const app = express()
app.use(express.static(path.join(__dirname, "public")))
app.set("trust proxy", true)

const expressServer = app.listen(PORT, () => {
    console.log(`PORT ${PORT} OPEN`)
})

//NOTE - IO Sever
const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3500", "http://127.0.0.1:3500"],
        methods: ["GET", "POST"]
    }
})
//!SECTION

io.on("connection", socket => {
    console.log(`${socket.id} Connected`)

    io.emit("ip", `${getIP(socket)}`)
})

function getIP(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for']
    const socketIP = socket.handshake.address
    const realIP = forwarded ? forwarded.split(',')[0] : socketIP

    return realIP.startsWith("::ffff:") ? realIP.substring(7) : realIP
}