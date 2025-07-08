import * as THREE from "/three/build/three.module.js"
import Stats from "/three/examples/jsm/libs/stats.module.js"
import { GLTFLoader } from "/three/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from '/three/examples/jsm/controls/OrbitControls.js'

import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/+esm'
import cannonDebugger from 'https://cdn.jsdelivr.net/npm/cannon-es-debugger@1.0.0/+esm'

import { config } from "./config.js"

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

const socket = io(), loader = new GLTFLoader()

const params = new URLSearchParams(window.location.search)
if (window.location.href.indexOf("?code=") === -1) {
    window.location.href += "lobby.html"
}

//NOTE - Join Listener
socket.on("connected", () => {
    const code = params.get("code")

    socket.emit("roomJoin", code)
    document.title = `FAraces ● ${code}`
})

//NOTE - Leader Listener
socket.on("leader", () => {
    document.title += "👑"
})

//SECTION - THREE
const container = document.getElementById("world")

//SECTION - THREE INIT

//NOTE - Camera INIT
const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000)
camera.position.set(0, 200, 0)
camera.near = 1
camera.far = 750
//camera.rotation.x = -3*Math.PI/8
camera.updateProjectionMatrix()

//NOTE - Renderer INIT
const renderer = new THREE.WebGLRenderer()
renderer.setSize(container.clientWidth, container.clientHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
container.appendChild(renderer.domElement)

//NOTE - Window Resize Listener
window.addEventListener("resize", () => {
    const w = container.clientWidth, h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
})

const scene = new THREE.Scene()

//!SECTION

//NOTE - WorldSync
socket.on("joinSyncWorld", (data) => {
    worldBase()

    const terrain = createTerrainMesh(data.terrain)
    createTrackTiles(data.tiles)

    scene.add(terrain)
})

//NOTE - WorldUpdate
socket.on("worldUpdate", (data) => {
    
    data.bodies.forEach((bodyData) => {
        if (bodyData.ID !== -1) {
            const body = world.bodies.find(b => b.id === bodyData.ID)
            if (body) {
                body.position.set(...bodyData.position)
                body.quaternion.setFromEuler(...bodyData.rotation)
                world.addBody(body)
            }
        }
    })
    
    cannonDebug.update()
    controls.update()
    renderer.render(scene, camera)
})

//NOTE - Terrain Mesh
function createTerrainMesh(matrix) {
    const size = config.terrain.size, w = matrix.length

    const geometry = new THREE.PlaneGeometry(size*(w - 1), size*(w - 1), w - 1, w - 1)
    geometry.rotateX(-Math.PI / 2)

    const vertices = geometry.attributes.position
    for (let i = 0; i < vertices.count; i++) {
        const x = i % w, y = Math.floor(i / w)

        vertices.setY(i, matrix[x][w - 1 - y])
    }
    vertices.needsUpdate = true
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
        color: 0x228b22,
        roughness: 1.0,
        metalness: 0.0
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.set(0, 0, 0)
    mesh.receiveShadow = true
    mesh.castShadow = true

    return mesh
}

//NOTE - CreateTiles
function createTrackTiles(tiles) {
    const normTiles = normalize(tiles)

    const border = config.terrain.border, tileSize = config.track.tileSize, tGrid = config.terrain.gridSize, tSize = config.terrain.size

    const offset = (tGrid-1)*tSize/2

    normTiles.forEach(([x, y, tile], idx) => {
        const nx = (x+border*2-1/2)*tileSize-offset, ny = (y+border*2-1/2)*tileSize-offset

        switch (tile[0]) {
            case "s": {
                load("/model/s.glb",[nx, ny], tile[1])
                break
            }
            case "t": {
                load("/model/t.glb",[nx, ny], tile[2]-1)
                break
            }

            default: {
                const geometry = new THREE.BoxGeometry(tileSize, 0.1, tileSize)
                const material = new THREE.MeshBasicMaterial( {color: 0x00ff00} )
                const cube = new THREE.Mesh(geometry, material)
                cube.position.set(nx, 7, ny)
                scene.add(cube)
            }
        }
    })

    function normalize(tiles) {
        return tiles.map(([x, y, dir], idx) => {
            //console.log(x, y, getTile(dir, idx, false))
            return [x, y, getTile(dir, idx, true)]
        })
        
        function getTile(dir, idx, t) {
            const l = tiles.length
            const after = tiles[(idx + 1 + l) % l][2]
            //if (t) console.log(idx, dir, after)
            return TURN[`${dir}>${after}`] || STRAIGHT[`${after}`] || ""
        }
    }

    function load(path, [x, y], rot) {
        loader.load(path, (gltf) => {
            const obj = gltf.scene
            obj.scale.set(.5, .5, .5)
            obj.traverse((child) => {
                if (child.isMesh) {
                    const mat = new THREE.MeshStandardMaterial({
                        color: child.material.color,
                        map: child.material.map,
                        //side: THREE.DoubleSide
                    })
                    child.material = mat
                    child.castShadow = true
                    child.receiveShadow = true
                    child.geometry.computeVertexNormals()
                }
            })

            const box = new THREE.Box3().setFromObject(obj)
            const size = new THREE.Vector3()
            box.getSize(size)

            obj.rotateY(Math.PI/2*parseInt(rot))
            obj.position.set(x, config.terrain.maxHeight, y)
            scene.add(obj)
        })
    }
}

//NOTE - Add SUN
function worldBase() {
    const sunLight = new THREE.DirectionalLight(0xffee88, 4)
    sunLight.position.set(50, 100, 50)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = config.THREE.shadowMap
    sunLight.shadow.mapSize.height = config.THREE.shadowMap

    const d = config.THREE.shadowCamera
    sunLight.shadow.camera.left = -d
    sunLight.shadow.camera.right = d
    sunLight.shadow.camera.top = d
    sunLight.shadow.camera.bottom = -d
    sunLight.shadow.camera.near = 10
    sunLight.shadow.camera.far = 200

    scene.add(sunLight)

    const helper = new THREE.DirectionalLightHelper(sunLight, 5)
    const shadowCamHelper = new THREE.CameraHelper(sunLight.shadow.camera)
    scene.add(helper, shadowCamHelper)

    scene.add(new THREE.AmbientLight(0x404040))
}

//!SECTION

//SECTION - DEBUG

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.807, 0),
})

const cannonDebug = cannonDebugger(scene, world, {color: 0x00ff00})

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = true
controls.enablePan = true
controls.enableDamping = true      
controls.dampingFactor = 0.05
controls.screenSpacePanning = false
controls.target.set(0, 0, 0)

socket.on("debugCANNON", (bodies) => {
    
    bodies.forEach(data => {
        let shape
        switch (data.shape.type) {
            case "SPHERE":
                shape = new CANNON.Sphere(data.shape.radius)
                break

            case "BOX":
                const he = data.shape.halfExtents;
                shape = new CANNON.Box(new CANNON.Vec3(he.x, he.y, he.z))
                break

            case "TRIMESH":
                const vertices = data.shape.vertices
                const indices = data.shape.indices
                shape = new CANNON.Trimesh(vertices, indices)
                break

            case "HEIGHTFIELD":
                shape = new CANNON.Heightfield(data.shape.data, {
                    elementSize: data.shape.elementSize
                })
                break

            default:
                console.warn("Unsupported shape:", data.shape.type)
                return
        }

        const body = new CANNON.Body({
            mass: data.mass,
            position: new CANNON.Vec3(data.position.x, data.position.y, data.position.z),
            quaternion: new CANNON.Quaternion(
                data.quaternion.x,
                data.quaternion.y,
                data.quaternion.z,
                data.quaternion.w
            ),
            shape: shape,
        })
        body.id = data.id

        world.addBody(body)
    })

    console.log("Synced Cannon world with", bodies.length, "bodies")
})

//!SECTION