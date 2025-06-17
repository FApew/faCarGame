import * as THREE from "/three/build/three.module.js"
import Stats from "/three/examples/jsm/libs/stats.module.js"
import { GLTFLoader } from "/three/examples/jsm/loaders/GLTFLoader.js"

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
const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000, {
    position: new THREE.Vector3(0, 70, 7),
    near: 5,
    far: 500,
    rotation: new THREE.Vector3(-3*Math.PI/8, 0, 0)
})
camera.updateProjectionMatrix()

//NOTE - Renderer INIT
const renderer = new THREE.WebGLRenderer()
renderer.setSize(container.clientWidth, container.clientHeight)
container.appendChild(renderer.domElement)

//NOTE - Window Resize Listener
window.addEventListener("resize", () => {
    const w = container.clientWidth, h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
})

//!SECTION

//NOTE - WorldSync
socket.on("worldSync", (data) => {

})

//NOTE - WorldUpdate
socket.on("worldUpdate", (data) => {
    
})

//!SECTION