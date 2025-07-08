import { config } from "../server.js"

const DIRS = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0]
]

export function genTrack(trkGrid) {
    const trackConfig = config.track
    const normCenter = trackConfig.normCenter, pCount = trackConfig.pCount, minD = trackConfig.minD, maxTries = trackConfig.maxTries, maxCross = trackConfig.maxCross, maxStraight = trackConfig.maxStraight, randomness = trackConfig.randomness

    //NOTE - PQ class
    class PriorityQueue {
        constructor() {
            this.elements = []
        }

        enqueue(elm) {
            this.elements.push(elm)
            if (Math.random() > 1-randomness) {
                this.elements = shuffle(this.elements)
            } else {
                this.elements.sort((a, b) => { a.dist - b.dist})
            }
        }

        dequeue() {
            return this.elements.shift()
        }

        isEmpty() {
            return this.elements.length === 0
        }
    }
    
    let trackMTX = []
    for (let i = 0; i < maxTries && trackMTX.length === 0; i++) {
        const points = getPoints()

        const ring = getRing(points)
        if (!ring) continue

        trackMTX = getPath(ring)
    }
    return trackMTX

    //NOTE - getPoints()
    function getPoints() {
        const nG = trkGrid*normCenter; const floor = (a) => {return Math.floor(a)}

        let points = [[3, 0], [4, 0], [5, 0]]
        for (let i = 0; i < maxTries && points.length < pCount; i++) {
            let x, y

            for (let j = 0; j < maxTries; j++) {
                x = floor(Math.random()*nG), y = floor(Math.random()*nG)
                
                x = x > nG/2 ? x + floor(trkGrid*(1-normCenter)) : x
                y = y > nG/2 ? y + floor(trkGrid*(1-normCenter)) : y
                
                if (points.some((p) => {return p && Math.hypot(p[0] - x, p[1] - y) < trkGrid*minD})) continue

                points.push([x, y])
                break
            }
        }

        return points
    }
    
    //NOTE - getRing()
    function getRing(points) {
        for (let i = 0; i < maxTries; i++) {
            const path = shuffle(points)
            const cc = countCrs(path)

            if (cc <= maxCross) return path
        }

        //CountCrosses
        function countCrs(path) {
            const l = path.length

            let c = 0
            for (let i = 0; i < l; i++ ) {
                for (let j = i + 1; j < l; j++) {
                    const a1 = path[i], a2 = path[(i+1) % l]
                    const b1 = path[j], b2 = path[(j+1) % l]

                    if ((i+1) % l === j || (j+1) % l === i || i === j) continue
                    if (checkCrs(a1, a2, b1, b2)) c++
                }
            }
            return c

            //Check if Cross
            function checkCrs(p1, p2, p3, p4) {
                return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)

                //CounterClockWise Algorithm
                function ccw(a, b, c) {
                    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0])
                }
            }
        }
    }

    //NOTE - GetFullPath
    function getPath(ring) {
        const grid = Array(trkGrid).fill().map(() => new Uint8Array(trkGrid)), nearby = getNearby(ring), l = ring.length
        let crsCount = 0

        //SegmentLoop
        const fullPath = []
        for (let i = 0; i < l; i++) {
            const a = ring[i], b = ring[(i+1) % l]
            const seg = getSegment(a, b)

            if (!seg) return []

            seg.path.forEach(([x, y, dir]) => {
                grid[x][y]++
                fullPath.push([x, y, dir])
            })
            seg.turns.forEach(([x, y]) => {
                grid[x][y] = 3
            })
        }

        return fullPath

        //NOTE - Segment Creation
        function getSegment(a, b) {
            const visited = new Set(), pq = new PriorityQueue()
            pq.enqueue({
                pos: a,
                dir: null,
                straight: 0,
                path: [],
                turns: [],
                crsCount: crsCount,
                dist: mhtDist(a, b)
            })
            visited.add(`${a[0]},${a[1]}`)

            while(!pq.isEmpty()) {
                //Select the tile to step to
                const curr = pq.dequeue()
                const [cx, cy] = curr.pos

                //Check if finished
                if (cx === b[0] && cy === b[1]) {
                    return {
                        path: curr.path,
                        turns: curr.turns,
                        crsCount: curr.crsCount
                    } 
                }

                //Check every possible DIR
                for (const [dx, dy] of DIRS) {
                    const nx = cx+dx, ny = cy+dy, key = `${nx},${ny}`

                    //Continue if out of bounds
                    if (nx < 0 || ny < 0 || nx >= trkGrid || ny >= trkGrid) continue

                    //Continue if visited by same segment
                    if (visited.has(key)) continue

                    //Continue if too much straight
                    const sameDir = curr.dir && dx === curr.dir[0] && dy === curr.dir[1]
                    const strCount = sameDir ? curr.straight + 1 : 1
                    if (strCount > maxStraight) continue

                    //Continue if turn or intersection near key point
                    if ((nearby[nx][ny] && grid[nx][ny] >= 1) || grid[nx][ny] === 3) continue

                    //Continue if too much crosses
                    let newCrs = curr.crsCount
                    if (grid[nx][ny] === 1) {
                        if (!sameDir) continue //Continue if turn cross tile
                        newCrs++
                    }
                    if (newCrs > maxCross) continue

                    //Count new turns and save them
                    const newTurns = [...curr.turns], prev = curr.path[curr.path.lenght - 1]
                    if (prev && (dx !== prev[2][0] || dy !== prev[2][1])) newTurns.push([prev[0], prev[1]])

                    //Save the current place and sort it in the PQ ( A* or random )
                    visited.add(key)
                    pq.enqueue({
                        pos: [nx, ny],
                        dir: [dx, dy],
                        straight: strCount,
                        path: [...curr.path, [nx, ny, [dx, dy]]],
                        turns: newTurns,
                        crsCount: newCrs,
                        dist: mhtDist([nx, ny], b)
                    })
                }
            }
            return null

            //Manhattan Dist Algorithm
            function mhtDist(a, b) {
                return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
            }
        }

        //Get nearby KeyPoints tiles
        function getNearby(ring) {
            const nearby = Array(trkGrid).fill().map(() => new Uint8Array(trkGrid))

            for (const [x, y] of ring) {
                for (let nx = Math.max(0, x-1); nx <= Math.min(trkGrid-1, x+1); nx++) {
                    for (let ny = Math.max(0, y-1); ny <= Math.min(trkGrid-1, y+1); ny++) {
                        nearby[nx][ny] = 1
                    }
                }
            }
            return nearby
        }
    }

    //Array Shuffle Function
    function shuffle(array) {
        const arr = [...array]
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [arr[i], arr[j]] = [arr[j], arr[i]]
        }
        return arr
    }
}