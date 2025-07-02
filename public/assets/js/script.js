//import * as THREE from "/three/build/three.module.js"
//import Stats from "/three/examples/jsm/libs/stats.module.js"
//import { GLTFLoader } from "/three/examples/jsm/loaders/GLTFLoader.js"
//import { OrbitControls } from '/three/examples/jsm/controls/OrbitControls.js'

//import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/+esm'
//import cannonDebugger from 'https://cdn.jsdelivr.net/npm/cannon-es-debugger@1.0.0/+esm'

import { config } from "./config.js"

const socket = io()

const params = new URLSearchParams(window.location.search)
if (window.location.href.indexOf("?code=") == -1) {
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
camera.position.set(0, 100, 40)
camera.near = 5
camera.far = 500
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

    const terrain = createTerrainMesh(data)

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
            }
        }
    })
    const body = world.bodies.find(b => b.id === 3)
    world.addBody(body)
    
    cannonDebug.update()
    controls.update()
    renderer.render(scene, camera)
})

//NOTE - Terrain Mesh
function createTerrainMesh(matrix) {
    const size = config.terrain.size, w = matrix.length

    const geometry = new THREE.PlaneGeometry(w*size-size, w*size-size, w - 1, w - 1)
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

//NOTE - Add SUN
function worldBase() {
    const sunLight = new THREE.DirectionalLight(0xffee88, 4)
    sunLight.position.set(50, 100, 50)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = config.THREE.shadowMap
    sunLight.shadow.mapSize.height = config.THREE.shadowMap

    const d = 100;
    sunLight.shadow.camera.left = -d
    sunLight.shadow.camera.right = d
    sunLight.shadow.camera.top = d
    sunLight.shadow.camera.bottom = -d
    sunLight.shadow.camera.near = 10
    sunLight.shadow.camera.far = 200

    scene.add(sunLight)

    const helper = new THREE.DirectionalLightHelper(sunLight, 5);
    const shadowCamHelper = new THREE.CameraHelper(sunLight.shadow.camera);
    scene.add(helper, shadowCamHelper);

    scene.add(new THREE.AmbientLight(0x404040));
}

//!SECTION

//SECTION - DEBUG

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.807, 0),
})

const cannonDebug = cannonDebugger(scene, world, {
    color: 0x00ff00,
})

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