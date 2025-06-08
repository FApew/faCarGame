const socket = io()

const params = new URLSearchParams(window.location.search)
if (window.location.href.indexOf("?code=") == -1) {
    window.location.href += "lobby.html"
}

socket.on("connected", (data) => {
    document.body.innerHTML = data
    const code = params.get("code")

    socket.emit("roomJoin", code)
    document.title += ` ${code}`
})