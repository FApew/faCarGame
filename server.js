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

let roomList = []

//NOTE - ONconnection
io.on("connection", socket => {
    console.log(`${socket.id} Connected`)

    io.to(socket.id).emit("connected", socket.id/*`${getIP(socket)}`*/)

    //SECTION - Lobby Menagement
    socket.on("roomJoin", (data) => {
        const idx = roomList.findIndex(subArr => subArr[0] === data)

        if (idx != -1) {
            roomList[idx][1]++ 
        } else {
            roomList.push([data, 1])
        }

        socket.room = data
        console.log(roomList)
    })

    socket.on("roomCreate", () => {
        let room
        do {
            room = Math.round(Math.random()*9999).toString().padStart(4, "0")
        } while (roomList.findIndex(subArr => subArr[0] === room) != -1)

        io.to(socket.id).emit("roomCreate", room)
    })

    socket.on('disconnect', () => {
        const room = socket.room
        if (room) {
            socket.room = undefined

            const idx = roomList.findIndex(subArr => subArr[0] === room)
            roomList[idx][1]--

            if (roomList[idx][1] <= 0) {
                roomList.splice(idx, 1)
            }
            console.log(roomList)
        }
    })
    //!SECTION
})

//NOTE - getIP
function getIP(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for']
    const socketIP = socket.handshake.address
    const realIP = forwarded ? forwarded.split(',')[0] : socketIP

    return realIP.startsWith("::ffff:") ? realIP.substring(7) : realIP
}