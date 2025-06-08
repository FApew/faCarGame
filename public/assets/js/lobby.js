const socket = io()

//NOTE - HTML Elements
const code = document.getElementById("code")
const join = document.getElementById("join")
const create = document.getElementById("create")

//NOTE - Code Normalize
code.addEventListener("change", () => {
    if (code.value < 0) code.value = 0
    else if (code.value > 9999) code.value = 9999
})

//NOTE - Join Listener
join.addEventListener("click", () => {
    if (code.value) {
        let room = code.value.toString().padStart(4, "0");

        socket.emit("roomJoin", room)
        window.location.href = location.origin + `?code=${room}`
    }
})

//NOTE - Create Listener
create.addEventListener("click", () => {
    socket.emit("roomCreate")
    socket.on("roomCreate", (data) => {
        window.location.href = location.origin + `?code=${data}`
    })
})