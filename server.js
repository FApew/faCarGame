//SECTION - IMPORTS
import express from "express"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url"

import * as CANNON from "cannon-es"
import { Quaternion, Euler } from "three"

import { genTerrain } from "./scripts/genTerrain.js"
import { genTrack } from "./scripts/genTrack.js"
//!SECTION 

//NOTE - JSON Config Parser
import { readFile } from "fs/promises"
const json = await readFile(new URL("./config.json", import.meta.url), "utf8")
export const config = JSON.parse(json)

//SECTION - Server Creation
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

//NOTE - PORT
const PORT = process.env.PORT || 3500

//NOTE - Express Sever
const app = express()
app.use(express.static(path.join(__dirname, "public")))
app.use('/three', express.static(path.join(__dirname, 'node_modules/three')))
app.use('/cannon-es', express.static(path.join(__dirname, 'node_modules/cannon-es')))
app.use('/model', express.static(path.join(__dirname, 'public/assets/model')))
app.use('/scripts', express.static(path.join(__dirname, 'scripts')))

app.get("/config.json", (req, res) => {
  res.sendFile(path.join(__dirname, "config.json"))
})

app.get("/public/assets/js/config.js", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/assets/js/config.js"))
})
app.get("/public/assets/js/loadTiles.js", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/assets/js/loadTiles.js"))
})


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
            joinSyncWorld(data, socket)
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
        } while (roomList.findIndex(subArr => subArr[0] === room) !== -1)

        io.to(socket.id).emit("roomCreate", room)
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
})
//!SECTION

//SECTION - Room INIT and TERM

//NOTE - Create Room
async function createRoom(room) {
    ROOMS.set(room, {
        world: null, track: null, leader: null, gameState: 0, loop: null
    })

    await setLeader(room)
    await createPhysicWorld(room)
    await genMap(room)

    const IntervalID = setInterval(() => update(room), 1000 / config.gameplay.fps)

    ROOMS.set(room,{
        ...ROOMS.get(room),
        loop: IntervalID
    })

    joinSyncWorld(room)
}

//NOTE - SetLederFunction
async function setLeader(room) {
    const sockets = await io.in(room).fetchSockets()
    const ID = sockets.length > 0 ? sockets[0].id : null
    ROOMS.set(room,{
        ...ROOMS.get(room),
        leader: ID
    })

    io.to(ID).emit("leader")
}

//NOTE - Join World Sync
async function joinSyncWorld(room, socket) {
    const ROOM = ROOMS.get(room)
    const phase = ROOM.gameState
    const terrain = ROOM.track.terrain, tiles = ROOM.track.tiles
    const world = ROOM.world

    let receiver = socket ? socket.id : room

    io.to(receiver).emit("joinSyncWorld", {terrain: terrain, tiles: tiles})
    io.to(receiver).emit("debugCANNON", serializeCannonWorld(world))
}

//NOTE - Remove Room
async function removeRoom(room) {
    clearInterval(ROOMS.get(room).loop)
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

//NOTE - Physic Update
async function update(room) {

    const world = ROOMS.get(room).world
    if (world) {
        world.step(1/config.gameplay.fps)

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
//!SECTION

//SECTION - Track Generation

const STRAIGHT = {
    "-1,0": "s1",  // left
    "1,0": "s3",   // right
    "0,-1": "s0",  // up
    "0,1": "s2"    // down
}

const TURN = {
    "0,-1>1,0": "t01", // up to right
    "1,0>0,1": "t00",  // right to down
    "0,1>-1,0": "t03", // down to left
    "-1,0>0,-1": "t02", // left to up
    "1,0>0,-1": "t13",  // right to up
    "0,1>1,0": "t12",   // down to right
    "-1,0>0,1": "t11",  // left to down
    "0,-1>-1,0": "t10'"  // up to left
}

//NOTE - genMap
async function genMap(room) {
    const world = ROOMS.get(room).world

    const tSize = config.terrain.size, tileSize = config.track.tileSize, border = config.terrain.border

    //TerrainMTX
    const TrnMtx = genTerrain()

    const offset = (TrnMtx.length-1)*tSize/2

    //Terrain Body
    const tShape = new CANNON.Heightfield(TrnMtx, { elementSize: tSize })
    const tBody = new CANNON.Body({ mass: 0})
    tBody.addShape(tShape)
    tBody.position.set(-offset, 0, offset)
    tBody.quaternion.setFromEuler(-Math.PI/2, 0, 0)
    tBody.id = -1

    //world.addBody(tBody)

    //Track MTX
    const trkGrid = Math.floor((TrnMtx.length-1)*tSize / tileSize) - border*2
    const TrkMtx = genTrack(trkGrid)

    ROOMS.set(room, {
        ...ROOMS.get(room),
        track: {
            terrain: TrnMtx,
            tiles: TrkMtx
        }
    })
    
    //DebugTiles
    const tileShape = new CANNON.Box(new CANNON.Vec3(tileSize/2, 0.5, tileSize/2))
    TrkMtx.forEach(([x, y], idx) => {
        const nx = (x+border*2-1/2)*tileSize-offset, ny = (y+border*2-1/2)*tileSize-offset

        const tileBody = new CANNON.Body({mass: 0, shape: tileShape})
        tileBody.position.set(nx, config.terrain.maxHeight, ny)
        tileBody.id = 1000+idx
        world.addBody(tileBody)
    })


    /*const bxShape = new CANNON.Box(new CANNON.Vec3((TrnMtx.length-1)/2, 0.1, 0.1))
    for (let i = 0; i <= trkGrid+2*border+1; i++) {
        const bxBody = new CANNON.Body({mass: 0, shape: bxShape})
        bxBody.position.set(0, 8, i*tileSize-(TrnMtx.length-1)*tSize/2-tileSize)
        bxBody.id = -5
        world.addBody(bxBody)
    }
    for (let i = 0; i <= trkGrid+2*border; i++) {
        const bxBody = new CANNON.Body({mass: 0, shape: bxShape})
        bxBody.position.set(i*tileSize-(TrnMtx.length-1)*tSize/2, 8, 0)
        bxBody.quaternion.setFromEuler(0, Math.PI/2, 0)
        bxBody.id = -5
        world.addBody(bxBody)
    }

    const radius = 1;  // adjust radius as needed
    const sphereShape = new CANNON.Sphere(radius);
    const sphereBody = new CANNON.Body({ mass: 1 }); // mass > 0 to be dynamic
    sphereBody.id = 3
    sphereBody.addShape(sphereShape);

    // Position the sphere above the terrain - let's put it at height 10 for example
    sphereBody.position.set(0, 10, 0);

    world.addBody(sphereBody);*/
}

//!SECTION

//NOTE - getIP
function getIP(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for']
    const socketIP = socket.handshake.address
    const realIP = forwarded ? forwarded.split(',')[0] : socketIP

    return realIP.startsWith("::ffff:") ? realIP.substring(7) : realIP
}

//SECTION - DEBUG
function serializeCannonWorld(world) {
    return world.bodies.map(body => ({
        id: body.id,
        mass: body.mass,
        position: {
            x: body.position.x,
            y: body.position.y,
            z: body.position.z,
        },
        quaternion: {
            x: body.quaternion.x,
            y: body.quaternion.y,
            z: body.quaternion.z,
            w: body.quaternion.w,
        },
        shape: serializeShape(body.shapes[0]),
    }))
}

function serializeShape(shape) {
    if (!shape) return null

    switch (shape.type) {
        case CANNON.Shape.types.SPHERE:
            return { type: "SPHERE", radius: shape.radius }

        case CANNON.Shape.types.BOX:
            return {
                type: "BOX",
                halfExtents: {
                    x: shape.halfExtents.x,
                    y: shape.halfExtents.y,
                    z: shape.halfExtents.z,
                },
            }

        case CANNON.Shape.types.TRIMESH:
            return {
                type: "TRIMESH",
                vertices: Array.from(shape.vertices),
                indices: Array.from(shape.indices),
            }

        case CANNON.Shape.types.HEIGHTFIELD:
            return {
                type: "HEIGHTFIELD",
                data: shape.data,
                elementSize: shape.elementSize,
            }

        default:
            return { type: "UNKNOWN" }
    }
}

//!SECTION