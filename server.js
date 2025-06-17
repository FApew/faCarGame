//SECTION IMPORTS
import express from "express"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url"

import * as CANNON from "cannon-es"
import { Quaternion, Euler } from "three"

import { genTerrain } from "./scripts/genTerrain.js"
//!SECTION 

//NOTE - JSON Config Parser
import { readFile } from "fs/promises"
const json = await readFile(new URL("./config.json", import.meta.url), "utf8")
export const config = JSON.parse(json)

//SECTION Server Creation
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

//NOTE - PORT
const PORT = process.env.PORT || 3500

//NOTE - Express Sever
const app = express()
app.use(express.static(path.join(__dirname, "public")))
app.use('/three', express.static(path.join(__dirname, 'node_modules/three')))
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
const ROOMS = new Map()

//SECTION - Socket Operations
io.on("connection", socket => {
    console.log(`${socket.id} Connected`)

    io.to(socket.id).emit("connected", socket.id/*`${getIP(socket)}`*/)

    //SECTION - Lobby Menagement

    //NOTE - Join
    socket.on("roomJoin", (data) => {
        const idx = roomList.findIndex(subArr => subArr[0] === data)

        socket.room = data
        socket.join(data)

        if (idx != -1) {
            roomList[idx][1]++
        } else {
            roomList.push([data, 1])
            createRoom(data)
        }

        console.log(roomList)
    })

    //NOTE - Room Creation
    socket.on("roomCreate", async () => {
        let room
        do {
            room = Math.round(Math.random()*9999).toString().padStart(4, "0")
        } while (roomList.findIndex(subArr => subArr[0] === room) != -1)

        io.to(socket.id).emit("roomCreate", room)
        createRoom(room)
    })

    //NOTE - Disconection
    socket.on('disconnect', () => {
        const room = socket.room
        if (room) {
            socket.room = undefined
            socket.leave(room)

            const idx = roomList.findIndex(subArr => subArr[0] === room)
            roomList[idx][1]--

            if (roomList[idx][1] <= 0) { //Remove Room
                roomList.splice(idx, 1)
                removeRoom(room)
            } else { //Give New Leader if old one Left
                if (socket.id == ROOMS.get(room).leader) {
                    setLeader(room)
                }
            }
            console.log(roomList)
        }
    })
    //!SECTION

    //NOTE - SyncWorld
    function SyncWorld(room, socket) {
        io.to(socket.id).emit("worldSync", syncData)
    }

    //NOTE - Physic Update
    async function update() {
        for (let i = 0; i < roomList.length; i++) {
            const room = roomList[i][0]

            const world = ROOMS.get(room).world
            if (world) {
                world.step(1/60)

                const worldState = {
                    bodies: world.bodies.map(body => {

                        const quat = body.quaternion
                        return {
                            ID: body.id,
                            position: body.position.toArray(),
                            rotation: new Euler().setFromQuaternion(new Quaternion(quat.x, quat.y, quat.z, quat.w)).toArray()
                        }
                    })
                }

                io.to(room).emit("worldUpdate", worldState)  
            }
        }
    }
    setInterval(() => update(), 1000 / 60)
})
//!SECTION

//SECTION - Room INIT and TERM

//NOTE - Create Room
async function createRoom(room) {
    ROOMS.set(room, {
        world: null, track: null, leader: null, gameState: 0
    })

    await setLeader(room)
    await createPhysicWorld(room)
}

//NOTE - SetLederFunction
async function setLeader(room) {
    const socket = await io.in(room).fetchSockets()
    const ID = socket.length > 0 ? socket[0].id : null
    ROOMS.set(room,{
        ...ROOMS.get(room),
        leader: ID
    })

    io.to(ID).emit("leader")
}

//NOTE - Remove Room
function removeRoom(room) {

    ROOMS.delete(room)
}

//!SECTION

//SECTION Physic World

//NOTE - Pyshic INIT
async function createPhysicWorld(room) {
    const world = new CANNON.World({ 
        gravity: new CANNON.Vec3(0, -9.807, 0)
    })
    
    ROOMS.set(room, {
        ...ROOMS.get(room),
        world: world
    })
}
//!SECTION

//SECTION - Track Generation

//NOTE - genMap
function genMap(room) {
    const world = ROOMS.get(room).world

    const {matrix, size} = genTerrain()
    TerrainData.set(room, matrix)

    const tShape = new CANNON.Heightfield(matrix, { size })
    const tBody = new CANNON.Body({ mass: 0})
    tBody.addShape(tShape)
    tBody.position.set(-matrix.length*size / 2, 0, -matrix.length*size / 2)
    tBody.id = -1

    world.addBody(tBody)
}

//!SECTION

//NOTE - getIP
function getIP(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for']
    const socketIP = socket.handshake.address
    const realIP = forwarded ? forwarded.split(',')[0] : socketIP

    return realIP.startsWith("::ffff:") ? realIP.substring(7) : realIP
}