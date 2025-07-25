import { config } from "../server.js"
import { makeNoise2D } from 'open-simplex-noise'

export function genTerrain() {
    const w = config.terrain.gridSize, scale = config.terrain.noiseScale, maxHeight = config.terrain.maxHeight

    const noise2D = makeNoise2D(Date.now() + Math.random())

    const TrnMtx = []
    for (let x = 0; x < w; x++) {
        TrnMtx[x] = []
        for(let y = 0; y < w; y++) {
            const val = noise2D(x * scale, y * scale)
            TrnMtx[x][y] = (val + 1) / 2 * maxHeight
        }
    }

    return TrnMtx
}